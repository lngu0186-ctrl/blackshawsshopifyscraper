import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AUPharmacyScout/1.0)',
  'Accept': 'application/json, text/html;q=0.9',
  'Accept-Language': 'en-AU,en;q=0.9',
};

// ── Timing constants ──────────────────────────────────────────────────────────
const REQUEST_TIMEOUT_MS     = 20_000;
const COLLECTION_TIMEOUT_MS  = 45_000;
const STORE_TIMEOUT_MS       = 10 * 60_000;
const BACKOFF_DELAYS         = [2_000, 5_000, 15_000];
const INTER_COLLECTION_DELAY = 2_500;

// ── Collection state machine types ───────────────────────────────────────────
type CollectionState = 'queued' | 'running' | 'retrying' | 'fallback_strategy' | 'success' | 'skipped' | 'failed';
type StoreTerminal   = 'completed' | 'completed_with_skips' | 'failed' | 'cancelled' | 'timed_out';
type Strategy        = 'products_json' | 'wc_api' | 'collection_html' | 'sitemap_urls' | 'skip';

// ── Abort signal combiner ─────────────────────────────────────────────────────
// Combines multiple abort signals into one. If ANY source aborts, the combined
// signal fires immediately — including in-flight fetch()es.
function combineAbortSignals(...signals: AbortSignal[]): AbortController {
  const ctrl = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) { ctrl.abort(sig.reason); return ctrl; }
    sig.addEventListener('abort', () => ctrl.abort(sig.reason), { once: true });
  }
  return ctrl;
}

// ── fetchWithTimeout: accepts external abort signals ─────────────────────────
// BUG FIX: previously created its own AbortController with no link to
// storeAbort / skipAbort, making cancel/skip non-functional during fetch.
async function fetchWithTimeout(
  url: string,
  extraHeaders: Record<string, string> = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
  ...externalSignals: AbortSignal[]
): Promise<Response> {
  const timeoutCtrl = new AbortController();
  const tid = setTimeout(() => timeoutCtrl.abort(`timeout:${url}`), timeoutMs);

  // Combine timeout with any external abort signals (store cancel, skip, etc.)
  const combined = combineAbortSignals(timeoutCtrl.signal, ...externalSignals);

  try {
    const res = await fetch(url, {
      signal: combined.signal,
      headers: { ...BASE_HEADERS, ...extraHeaders },
    });
    clearTimeout(tid);
    return res;
  } catch (err) {
    clearTimeout(tid);
    const msg = String((err as Error).message || err);
    if ((err as Error).name === 'AbortError') {
      const reason = combined.signal.reason ?? timeoutCtrl.signal.reason ?? '';
      if (String(reason).startsWith('timeout:')) throw new Error(String(reason));
      throw err; // re-throw so callers can detect operator abort vs timeout
    }
    throw err;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function slugify(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function htmlToPlainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}
async function sha256(str: string): Promise<string> {
  const data = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function buildContentHash(product: any): Promise<string> {
  const prices = (product.variants || []).map((v: any) => String(v.price || '')).sort();
  const raw = [product.title || '', htmlToPlainText(product.body_html || ''), product.tags || '',
    product.vendor || '', product.product_type || '', ...prices].join('|');
  return sha256(raw);
}
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  // BUG FIX: sleep now respects abort signals so backoff doesn't block cancel/skip
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      if (signal.aborted) { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); return; }
      signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    }
  });
}

// ── Inline confidence scoring ─────────────────────────────────────────────────
function computeConfidence(product: any, priceMin: number | null, hasVariantWithSku: boolean): {
  score: number;
  status: string;
  flags: string[];
} {
  const flags: string[] = [];
  let score = 0;

  if (product.title && product.title.trim()) score += 20;
  if (priceMin != null && priceMin > 0) score += 20;
  else flags.push('missing_price');
  if (product.vendor && product.vendor.trim()) score += 10;
  if (product.images && product.images.length > 0) score += 15;
  else flags.push('missing_image');
  if (product.body_html && product.body_html.trim()) score += 15;
  else flags.push('missing_description');
  if (hasVariantWithSku) score += 10;
  score += 10; // +10 for newly scraped

  let status: string;
  const hasCriticalFlag = flags.includes('missing_price') || flags.includes('missing_image');
  if (score >= 80 && !hasCriticalFlag) status = 'ready';
  else if (score >= 80) status = 'review_required';
  else if (score >= 50) status = 'validated';
  else if (score >= 20) status = 'normalized';
  else status = 'discovered';

  return { score, status, flags };
}

// ── Categorise errors for reason_code ────────────────────────────────────────
function classifyError(err: unknown, status?: number): string {
  const msg = String(err).toLowerCase();
  if (msg.includes('parent run exceeded 3 hour timeout')) return 'parent_timeout';
  if (msg.includes('store_timeout') || msg.includes('timed_out')) return 'store_timeout';
  if (msg.includes('timeout:collection')) return 'collection_timeout';
  if (status === 429) return 'retryable_http_429';
  if (status === 503) return 'retryable_http_503';
  if (status && status >= 500) return `http_${status}`;
  if (status === 401 || status === 403) return `http_${status}`;
  if (msg.startsWith('timeout:')) return 'request_timeout';
  if (msg.includes('invalid json') || msg.includes('json')) return 'invalid_json';
  if (msg.includes('econnreset') || msg.includes('network')) return 'network_error';
  return 'unknown_error';
}

// ── Platform detection — expanded ────────────────────────────────────────────
async function detectStorePlatform(baseUrl: string): Promise<{
  platform: string;
  confidence: string;
  evidence: string[];
}> {
  const evidence: string[] = [];

  // Test 1: Shopify /products.json
  try {
    const res = await fetchWithTimeout(`${baseUrl}/products.json?limit=1`, {}, 10_000);
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d.products)) {
        evidence.push('products_json_responded');
        return { platform: 'shopify', confidence: 'high', evidence };
      }
    }
    await res.text().catch(() => {}); // consume body
  } catch { /* fall through */ }

  // Test 2: WooCommerce REST API
  try {
    const res = await fetchWithTimeout(`${baseUrl}/wp-json/wc/v3/products?per_page=1`, {}, 8_000);
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) {
        evidence.push('wc_rest_api_responded');
        return { platform: 'woocommerce', confidence: 'high', evidence };
      }
    }
    await res.text().catch(() => {}); // consume body
  } catch { /* fall through */ }

  // Test 3: BigCommerce API
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/storefront/products?limit=1`, {}, 8_000);
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d) || d?.data) {
        evidence.push('bigcommerce_api_responded');
        return { platform: 'bigcommerce', confidence: 'high', evidence };
      }
    }
    await res.text().catch(() => {}); // consume body
  } catch { /* fall through */ }

  // Test 4: HTML heuristics
  try {
    const res = await fetchWithTimeout(baseUrl, { Accept: 'text/html' }, 10_000);
    if (res.ok) {
      const html = await res.text();

      // Shopify signals
      if (html.includes('cdn.shopify.com')) evidence.push('cdn_shopify_com');
      if (html.includes('Shopify.theme')) evidence.push('shopify_theme_js');
      if (/meta[^>]+generator[^>]+Shopify/i.test(html)) evidence.push('meta_generator_shopify');
      if (html.includes('shopify-section')) evidence.push('shopify_section_class');
      if (evidence.some(e => ['cdn_shopify_com','shopify_theme_js','meta_generator_shopify','shopify_section_class'].includes(e))) {
        return { platform: 'shopify', confidence: 'medium', evidence };
      }

      // WooCommerce signals
      if (html.includes('/wp-content/')) evidence.push('wp_content_path');
      if (html.includes('woocommerce')) evidence.push('woocommerce_class');
      if (/meta[^>]+generator[^>]+WooCommerce/i.test(html)) evidence.push('meta_generator_woocommerce');
      if (html.includes('wc-block')) evidence.push('wc_block_class');
      if (evidence.some(e => ['wp_content_path','woocommerce_class','meta_generator_woocommerce','wc_block_class'].includes(e))) {
        return { platform: 'woocommerce', confidence: 'medium', evidence };
      }

      // BigCommerce signals
      if (html.includes('bigcommerce') || html.includes('cdn.bigcommerce.com')) {
        evidence.push('bigcommerce_reference');
        return { platform: 'bigcommerce', confidence: 'medium', evidence };
      }

      // OpenCart signals
      if (html.includes('route=common') || html.includes('catalog/view/theme') || html.includes('OpenCart')) {
        evidence.push('opencart_route_param');
        return { platform: 'opencart', confidence: 'medium', evidence };
      }

      // Storbie (NZ/AU pharmacy platform)
      if (html.includes('storbie') || html.includes('storebie') || /storbie\.com/i.test(html)) {
        evidence.push('storbie_reference');
        return { platform: 'storbie', confidence: 'medium', evidence };
      }
    }
  } catch { /* fall through */ }

  // Test 5: Shopify collections.json as weak fallback
  try {
    const res = await fetchWithTimeout(`${baseUrl}/collections.json?limit=1`, {}, 8_000);
    if (res.ok) {
      const d = await res.json();
      if (d && Array.isArray(d.collections)) {
        evidence.push('collections_json_responded');
        return { platform: 'shopify', confidence: 'low', evidence };
      }
    }
    await res.text().catch(() => {});
  } catch { /* fall through */ }

  evidence.push('no_platform_signals_found');
  return { platform: 'unknown', confidence: 'none', evidence };
}

// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const supabaseUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: userData, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !userData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  const userId = userData.user.id;

  const { scrapeRunId, storeId, interPageDelay = 2500, maxProducts = 0 } = await req.json();
  if (!scrapeRunId || !storeId) return new Response(JSON.stringify({ error: 'scrapeRunId and storeId required' }), { status: 400, headers: corsHeaders });

  // Fetch store + run_store record
  // FIX: use maybeSingle() instead of single() to avoid noisy PostgREST 406 errors
  const [storeRes, runStoreRes] = await Promise.all([
    supabaseAdmin.from('stores').select('*').eq('id', storeId).eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('scrape_run_stores').select('*').eq('scrape_run_id', scrapeRunId).eq('store_id', storeId).maybeSingle(),
  ]);
  if (storeRes.error || !storeRes.data) return new Response(JSON.stringify({ error: 'Store not found' }), { status: 404, headers: corsHeaders });
  if (runStoreRes.error || !runStoreRes.data) return new Response(JSON.stringify({ error: 'scrape_run_store not found' }), { status: 404, headers: corsHeaders });

  const store = storeRes.data;
  const runStore = runStoreRes.data;
  const runStoreId = runStore.id;
  const storeSlug = slugify(store.name);
  // Always scrape from the site origin, never from a collection-scoped stored URL.
  // This protects older store records that may still have /collections/... in normalized_url.
  let baseUrl = store.normalized_url;
  try {
    const parsedBase = new URL(baseUrl);
    baseUrl = `${parsedBase.protocol}//${parsedBase.host}`;
  } catch { /* keep stored value if parsing fails */ }

  // ── Store-level AbortController (timeout + cancel propagation) ────────────
  const storeAbort = new AbortController();
  const storeTimeout = setTimeout(() => storeAbort.abort('store_timeout'), STORE_TIMEOUT_MS);

  // ── Per-collection skip AbortController — reset per collection ────────────
  let collectionSkipAbort = new AbortController();

  await supabaseAdmin.from('scrape_run_stores').update({ status: 'fetching', started_at: new Date().toISOString() }).eq('id', runStoreId);

  // ── Auth headers ─────────────────────────────────────────────────────────
  let authHeaders: Record<string, string> = {};
  if (store.requires_auth && store.auth_cookie) {
    authHeaders = { Cookie: store.auth_cookie };
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let totalProducts = 0;
  let totalPriceChanges = 0;
  let pagesVisited = 0;
  let collectionsCompleted = 0;
  let collectionsSkipped = 0;
  let collectionsFailed = 0;
  const seenProductIds = new Set<string>();

  // Batched quality warnings — emit one summary per store, not per-product
  const missingImage: string[] = [];
  const missingPrice: string[] = [];
  const missingDesc: string[] = [];

  // Strategy C: cache sitemap product handles once per run, not per collection
  let sitemapHandlesCache: string[] | null = null;

  // ── Control checks ─────────────────────────────────────────────────────────
  // These poll the DB and return a boolean synchronously after awaiting.
  // They are called at safe yield points inside loops.
  async function isRunCancelled(): Promise<boolean> {
    const { data } = await supabaseAdmin.from('scrape_runs').select('status').eq('id', scrapeRunId).maybeSingle();
    return data?.status === 'cancelled';
  }
  async function isCollectionSkipRequested(): Promise<boolean> {
    const { data } = await supabaseAdmin.from('scrape_run_stores').select('skip_requested').eq('id', runStoreId).maybeSingle();
    return !!data?.skip_requested;
  }

  // ── Combined signal helpers ───────────────────────────────────────────────
  // Used to pass to fetchWithTimeout so aborting store or skip fires immediately
  function storeAndSkipSignals(): AbortSignal[] {
    return [storeAbort.signal, collectionSkipAbort.signal];
  }

  // ── Event emitter ─────────────────────────────────────────────────────────
  async function emitEvent(opts: {
    stage: string; severity?: string; message: string;
    url?: string | null; reason_code?: string | null; raw_error?: string | null;
    collection_handle?: string | null; strategy_name?: string | null;
    attempt_number?: number; retry_count?: number; http_status?: number | null;
    duration_ms?: number | null; was_auto_recovered?: boolean; was_operator_action?: boolean;
  }) {
    const now = new Date().toISOString();
    await supabaseAdmin.from('scraper_events').insert({
      user_id: userId,
      store_id: storeId,      // ALWAYS set — never null
      run_id: scrapeRunId,    // ALWAYS set — never null
      stage: opts.stage,
      severity: opts.severity ?? 'info',
      message: opts.message,
      url: opts.url ?? null,
      reason_code: opts.reason_code ?? null,
      raw_error: opts.raw_error ?? null,
      collection_handle: opts.collection_handle ?? null,
      strategy_name: opts.strategy_name ?? null,
      attempt_number: opts.attempt_number ?? 0,
      retry_count: opts.retry_count ?? 0,
      http_status: opts.http_status ?? null,
      duration_ms: opts.duration_ms ?? null,
      was_auto_recovered: opts.was_auto_recovered ?? false,
      was_operator_action: opts.was_operator_action ?? false,
      ended_at: now,
    });
    // Heartbeat: update last_event_at so stall detection works
    await supabaseAdmin.from('scrape_run_stores').update({ last_event_at: now }).eq('id', runStoreId);
  }

  async function updateProgress(patch: Record<string, any>) {
    await supabaseAdmin.from('scrape_run_stores').update(patch).eq('id', runStoreId);
  }

  // ── Retry with exponential backoff — respects abort signals ───────────────
  // BUG FIX: previously sleep() didn't respect abort signals, so cancel/skip
  // would be delayed by the full backoff interval (up to 15s) before responding.
  async function retryFetch(
    url: string,
    extraHeaders: Record<string, string>,
    label: string,
  ): Promise<{ res: Response | null; error: string | null; reasonCode: string; attempt: number }> {
    let lastError = '';
    let reasonCode = 'unknown_error';

    for (let attempt = 0; attempt <= BACKOFF_DELAYS.length; attempt++) {
      // Check abort/skip BEFORE every attempt AND before every sleep
      if (storeAbort.signal.aborted) return { res: null, error: 'store_aborted', reasonCode: 'operator_cancelled', attempt };
      if (collectionSkipAbort.signal.aborted) return { res: null, error: 'collection_skipped', reasonCode: 'operator_skipped', attempt };

      try {
        const res = await fetchWithTimeout(url, extraHeaders, REQUEST_TIMEOUT_MS, ...storeAndSkipSignals());

        if (res.status === 429 || res.status >= 500) {
          lastError = `HTTP ${res.status}`;
          reasonCode = classifyError(null, res.status);
          await emitEvent({
            stage: 'retryable_http_error', severity: 'warning',
            message: `${label} received HTTP ${res.status}${attempt < BACKOFF_DELAYS.length ? ' — retrying' : ' — retries exhausted'}`,
            url, reason_code: reasonCode, http_status: res.status,
            attempt_number: attempt + 1, retry_count: attempt,
          });
          await res.text().catch(() => {}); // consume body to free connection
          if (attempt < BACKOFF_DELAYS.length) {
            // BUG FIX: pass combined signal to sleep so it wakes immediately on abort
            const combined = combineAbortSignals(storeAbort.signal, collectionSkipAbort.signal);
            try { await sleep(BACKOFF_DELAYS[attempt], combined.signal); } catch { /* aborted — exit immediately */ }
            continue;
          }
          return { res: null, error: lastError, reasonCode, attempt };
        }

        if (attempt > 0) {
          await emitEvent({
            stage: 'retry_recovered', severity: 'info',
            message: `${label} recovered after ${attempt} retr${attempt === 1 ? 'y' : 'ies'}`,
            url, reason_code: 'retry_recovered', attempt_number: attempt + 1, retry_count: attempt,
            was_auto_recovered: true,
          });
        }
        return { res, error: null, reasonCode: 'ok', attempt };
      } catch (err) {
        const aborted = storeAbort.signal.aborted || collectionSkipAbort.signal.aborted;
        if (aborted || (err as Error).name === 'AbortError') {
          const reason = storeAbort.signal.aborted ? 'operator_cancelled' : 'operator_skipped';
          return { res: null, error: 'aborted', reasonCode: reason, attempt };
        }
        lastError = String(err);
        reasonCode = classifyError(err);
        if (reasonCode === 'request_timeout' || reasonCode === 'network_error') {
          await emitEvent({
            stage: 'retryable_fetch_error', severity: 'warning',
            message: `${label} failed with ${reasonCode}${attempt < BACKOFF_DELAYS.length ? ' — retrying' : ' — retries exhausted'}`,
            url, reason_code: reasonCode, raw_error: lastError,
            attempt_number: attempt + 1, retry_count: attempt,
          });
        }
        if (attempt < BACKOFF_DELAYS.length) {
          const combined = combineAbortSignals(storeAbort.signal, collectionSkipAbort.signal);
          try { await sleep(BACKOFF_DELAYS[attempt], combined.signal); } catch { /* aborted */ }
        }
      }
    }
    return { res: null, error: lastError, reasonCode, attempt: BACKOFF_DELAYS.length };
  }

  // ── Product persistence with inline confidence scoring ────────────────────
  async function processProduct(product: any, productBaseUrl: string, collectionHandle?: string) {
    const shopifyId = String(product.id);
    if (seenProductIds.has(shopifyId)) return;
    seenProductIds.add(shopifyId);

    const handle = product.handle || '';
    const storeHandle = `${storeSlug}-${handle}`;
    const bodyPlain = htmlToPlainText(product.body_html || '');
    const contentHash = await buildContentHash(product);
    const priceArr = (product.variants || []).map((v: any) => parseFloat(v.price) || 0).filter((p: number) => p > 0);
    const compareArr = (product.variants || []).map((v: any) => parseFloat(v.compare_at_price) || 0).filter((p: number) => p > 0);
    const priceMin = priceArr.length > 0 ? Math.min(...priceArr) : null;
    const productType = product.product_type || (collectionHandle
      ? collectionHandle.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : null);
    const hasVariantWithSku = (product.variants || []).some((v: any) => v.sku || v.barcode);
    const { score, status, flags } = computeConfidence(product, priceMin, hasVariantWithSku);

    const productData = {
      user_id: userId, store_id: storeId, store_name: store.name, store_slug: storeSlug,
      handle, store_handle: storeHandle, title: product.title || '',
      body_html: product.body_html || null, body_plain: bodyPlain || null,
      vendor: product.vendor || null, product_type: productType,
      tags: Array.isArray(product.tags) ? product.tags.join(', ') : (product.tags || null),
      published: product.published_at != null, status: 'active',
      url: `${productBaseUrl}/products/${handle}`,
      images: product.images || [], options: product.options || [], raw_product: product,
      price_min: priceMin,
      price_max: priceArr.length > 0 ? Math.max(...priceArr) : null,
      compare_at_price_min: compareArr.length > 0 ? Math.min(...compareArr) : null,
      compare_at_price_max: compareArr.length > 0 ? Math.max(...compareArr) : null,
      shopify_product_id: shopifyId,
      shopify_created_at: product.created_at || null, shopify_updated_at: product.updated_at || null,
      shopify_published_at: product.published_at || null,
      scraped_at: new Date().toISOString(), content_hash: contentHash,
      confidence_score: score,
      product_scrape_status: status,
      issue_flags: flags,
    };

    // Batch quality issues silently
    if (!priceMin) missingPrice.push(handle);
    if (!product.images || product.images.length === 0) missingImage.push(handle);
    if (!product.body_html || product.body_html.trim() === '') missingDesc.push(handle);

    // FIX: use maybeSingle() not single() — avoids noisy 406 when row doesn't exist yet
    const { data: existing } = await supabaseAdmin.from('products').select('id, content_hash, first_seen_at').eq('store_id', storeId).eq('handle', handle).maybeSingle();
    const hashChanged = existing && existing.content_hash !== contentHash;
    const upsertData: any = { ...productData, first_seen_at: existing?.first_seen_at || new Date().toISOString() };
    if (hashChanged) upsertData.last_changed_at = new Date().toISOString();

    const { data: saved, error: productErr } = await supabaseAdmin.from('products').upsert(upsertData, { onConflict: 'store_id,handle' }).select('id').maybeSingle();
    if (productErr || !saved) return;
    const productId = saved.id;

    for (const variant of product.variants || []) {
      const variantData = {
        user_id: userId, product_id: productId, store_id: storeId,
        shopify_variant_id: String(variant.id),
        variant_position: variant.position || null, variant_title: variant.title || null,
        sku: variant.sku || null, barcode: variant.barcode || null,
        option1: variant.option1 || null, option2: variant.option2 || null, option3: variant.option3 || null,
        price: variant.price ? parseFloat(variant.price) : null,
        compare_at_price: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
        grams: variant.grams || 0, taxable: variant.taxable !== false, requires_shipping: variant.requires_shipping !== false,
        fulfillment_service: variant.fulfillment_service || 'manual',
        inventory_policy: variant.inventory_policy || 'deny',
        inventory_tracker: variant.inventory_management || null,
        inventory_quantity: variant.inventory_quantity || 0,
        featured_image_url: variant.featured_image?.src || null, raw_variant: variant,
      };
      const { data: upsertedVariant, error: variantErr } = await supabaseAdmin.from('product_variants').upsert(variantData, { onConflict: 'product_id,shopify_variant_id' }).select('id, price, compare_at_price').maybeSingle();
      if (variantErr || !upsertedVariant) continue;

      // FIX: maybeSingle() — no row yet is normal for a first scrape
      const { data: latestHistory } = await supabaseAdmin.from('variant_price_history').select('price, compare_at_price').eq('variant_id', upsertedVariant.id).order('recorded_at', { ascending: false }).limit(1).maybeSingle();
      const newPrice = upsertedVariant.price;
      const newCompareAt = upsertedVariant.compare_at_price;

      if (!latestHistory) {
        await supabaseAdmin.from('variant_price_history').insert({
          user_id: userId, product_id: productId, variant_id: upsertedVariant.id, store_id: storeId,
          store_handle: storeHandle, shopify_variant_id: String(variant.id),
          variant_sku: variant.sku || null, variant_title: variant.title || null,
          price: newPrice, compare_at_price: newCompareAt,
          previous_price: null, previous_compare_at_price: null,
          price_delta: null, price_delta_pct: null, compare_at_price_delta: null,
          price_changed: false, compare_at_price_changed: false, scrape_run_id: scrapeRunId,
        });
      } else {
        const priceChanged = latestHistory.price !== newPrice;
        const compareChanged = latestHistory.compare_at_price !== newCompareAt;
        if (priceChanged || compareChanged) {
          const delta = newPrice != null && latestHistory.price != null ? newPrice - latestHistory.price : null;
          const deltaPct = delta != null && latestHistory.price != null && latestHistory.price !== 0 ? delta / latestHistory.price : null;
          const compareDelta = newCompareAt != null && latestHistory.compare_at_price != null ? newCompareAt - latestHistory.compare_at_price : null;
          await supabaseAdmin.from('variant_price_history').insert({
            user_id: userId, product_id: productId, variant_id: upsertedVariant.id, store_id: storeId,
            store_handle: storeHandle, shopify_variant_id: String(variant.id),
            variant_sku: variant.sku || null, variant_title: variant.title || null,
            price: newPrice, compare_at_price: newCompareAt,
            previous_price: latestHistory.price, previous_compare_at_price: latestHistory.compare_at_price,
            price_delta: delta, price_delta_pct: deltaPct, compare_at_price_delta: compareDelta,
            price_changed: priceChanged, compare_at_price_changed: compareChanged, scrape_run_id: scrapeRunId,
          });
          if (priceChanged) {
            totalPriceChanges++;
            await supabaseAdmin.from('scrape_logs').insert({
              scrape_run_id: scrapeRunId, user_id: userId, store_id: storeId,
              level: 'price_change',
              message: `${product.title} — ${variant.title}: $${Number(latestHistory.price).toFixed(2)} → $${Number(newPrice).toFixed(2)}`,
              metadata: { product_id: productId, old_price: latestHistory.price, new_price: newPrice, delta, store_handle: storeHandle },
            });
          }
        }
      }
    }
    totalProducts++;
  }

  // ── Strategy A: products.json pagination ─────────────────────────────────
  // BUG FIX: page counter was incremented after the pagination-mode switch, causing
  // page 2 to be skipped. Corrected: page tracks what was JUST fetched, so
  // when switching from Link mode to page mode, start at page=2 (already returned p1).
  async function strategyA_productsJson(
    endpointUrl: string,
    collectionHandle: string,
  ): Promise<{ count: number; error: string | null; autoRecovered?: boolean }> {
    const t0 = Date.now();
    let count = 0;
    let useLinkHeader = true;   // start by assuming Link header will be present
    let page = 1;               // page 1 is the first fetch (endpointUrl already contains limit=250)
    let nextUrl: string | null = endpointUrl;

    while (nextUrl) {
      // ── Hot-path abort checks — checked INSIDE pagination loop ────────────
      if (storeAbort.signal.aborted) return { count, error: 'store_aborted' };
      if (collectionSkipAbort.signal.aborted) return { count, error: 'operator_skipped' };
      if (await isRunCancelled()) return { count, error: 'run_cancelled' };
      if (await isCollectionSkipRequested()) {
        collectionSkipAbort.abort('operator_skip'); // immediately abort in-flight next fetch
        return { count, error: 'operator_skipped' };
      }

      if (Date.now() - t0 > COLLECTION_TIMEOUT_MS) {
        return { count, error: 'timeout:collection', autoRecovered: false };
      }

      const { res, error: fetchErr, reasonCode, attempt } = await retryFetch(nextUrl, authHeaders, `[A] ${collectionHandle} p${page}`);
      if (!res) {
        if (reasonCode === 'operator_skipped' || reasonCode === 'operator_cancelled') return { count, error: fetchErr };
        return { count, error: fetchErr ?? 'no_response', autoRecovered: false };
      }
      if (!res.ok) {
        await res.text().catch(() => {}); // consume
        return { count, error: `HTTP ${res.status}`, autoRecovered: false };
      }

      let data: any;
      try { data = await res.json(); }
      catch { return { count, error: 'invalid_json', autoRecovered: false }; }

      const products: any[] = data.products || [];
      pagesVisited++;

      await emitEvent({
        stage: 'page_fetched', severity: 'info',
        message: `[A] ${collectionHandle} — page ${page} — ${products.length} products`,
        url: nextUrl, collection_handle: collectionHandle, strategy_name: 'products_json',
        attempt_number: attempt, duration_ms: Date.now() - t0,
      });
      // Increment run-level pages_visited
      await supabaseAdmin.from('scrape_runs').update({ pages_visited: pagesVisited }).eq('id', scrapeRunId);

      if (products.length === 0) break; // pagination terminus

      // ── Process products — check skip/cancel inside the product loop ──────
      for (const product of products) {
        if (storeAbort.signal.aborted || collectionSkipAbort.signal.aborted) break;
        if (maxProducts > 0 && totalProducts >= maxProducts) { nextUrl = null; break; }
        await processProduct(product, baseUrl, collectionHandle);
      }

      count += products.length;

      // ── Pagination logic ──────────────────────────────────────────────────
      // Priority 1: use Link header if present (most reliable)
      const linkHeader = res.headers.get('link') || '';
      const nextLinkMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);

      if (nextLinkMatch && useLinkHeader) {
        // Link header mode: follow exactly
        nextUrl = nextLinkMatch[1];
        page++;
      } else if (products.length >= 250) {
        // No Link header but full page returned — switch to ?page=N mode
        // BUG FIX: if we were on page 1 via Link mode and switch, next page is 2
        // Previous code set page=2 here then incremented at bottom → jumped to page 3
        if (useLinkHeader && !nextLinkMatch) {
          useLinkHeader = false;
          page = 2; // page 1 was just fetched, next is 2
        } else {
          page++; // already in ?page=N mode, advance normally
        }
        const baseEndpoint = endpointUrl.split('?')[0];
        nextUrl = `${baseEndpoint}?limit=250&page=${page}`;
      } else {
        // Short page — pagination terminus
        nextUrl = null;
      }

      if (nextUrl) {
        const combined = combineAbortSignals(storeAbort.signal, collectionSkipAbort.signal);
        try { await sleep(Math.max(interPageDelay, 2000), combined.signal); } catch { nextUrl = null; }
      }
    }

    await emitEvent({
      stage: 'pagination_complete', severity: 'info',
      message: `[A] ${collectionHandle} — pagination complete — ${page} page(s) visited — ${count} products`,
      collection_handle: collectionHandle, strategy_name: 'products_json',
      duration_ms: Date.now() - t0,
    });

    return { count, error: null, autoRecovered: false };
  }

  // ── Strategy B: HTML collection page — extract product links ─────────────
  // BUG FIX: brittle regex only matched double-quoted hrefs with lowercase handles.
  // New version: supports single/double quotes, absolute/relative URLs, query strings.
  async function strategyB_collectionHtml(
    collectionHandle: string,
  ): Promise<{ count: number; error: string | null }> {
    const url = `${baseUrl}/collections/${collectionHandle}`;
    const { res, error: fetchErr } = await retryFetch(url, { ...authHeaders, Accept: 'text/html' }, `[B] ${collectionHandle}`);
    if (!res || !res.ok) return { count: 0, error: fetchErr ?? `HTTP ${res?.status}` };

    const html = await res.text();

    // Extract product handles — robust multi-pattern approach
    const handleSet = new Set<string>();

    // Pattern 1: href="/products/handle" (double or single quotes, optional query string)
    const relativePattern = /href=["']\/products\/([a-z0-9][a-z0-9\-_]*)(?:[?#][^"']*)?["']/gi;
    for (const m of html.matchAll(relativePattern)) handleSet.add(m[1].toLowerCase());

    // Pattern 2: absolute URLs — href="https://domain.com/products/handle"
    try {
      const domain = new URL(baseUrl).hostname;
      const absolutePattern = new RegExp(`href=["']https?://${domain.replace('.', '\\.')}/products/([a-z0-9][a-z0-9\\-_]*)(?:[?#][^"']*)?["']`, 'gi');
      for (const m of html.matchAll(absolutePattern)) handleSet.add(m[1].toLowerCase());
    } catch { /* ignore URL parse failure */ }

    // Pattern 3: canonical link tags in product cards
    const canonicalPattern = /(?:data-url|data-handle|data-product-url)=["'](?:\/products\/)?([a-z0-9][a-z0-9\-_]*)["']/gi;
    for (const m of html.matchAll(canonicalPattern)) handleSet.add(m[1].toLowerCase());

    const uniqueHandles = [...handleSet];

    if (uniqueHandles.length === 0) {
      await emitEvent({
        stage: 'html_extraction_empty', severity: 'warning',
        message: `[B] ${collectionHandle} — HTML fallback found 0 product links. No matching href=/products/* patterns.`,
        url, collection_handle: collectionHandle, strategy_name: 'collection_html',
        reason_code: 'selector_missing',
      });
      return { count: 0, error: 'selector_missing' };
    }

    let count = 0;
    for (const handle of uniqueHandles) {
      // ── Hot-path abort checks inside product loop ─────────────────────────
      if (storeAbort.signal.aborted || collectionSkipAbort.signal.aborted) break;
      if (await isRunCancelled()) break;
      try {
        const productUrl = `${baseUrl}/products/${handle}.json`;
        const { res: pRes } = await retryFetch(productUrl, authHeaders, `[B] product ${handle}`);
        if (!pRes || !pRes.ok) {
          await pRes?.text().catch(() => {}); // consume
          continue;
        }
        const d = await pRes.json();
        if (d?.product) { await processProduct(d.product, baseUrl, collectionHandle); count++; }
        const combined = combineAbortSignals(storeAbort.signal, collectionSkipAbort.signal);
        try { await sleep(1500, combined.signal); } catch { break; }
      } catch { /* skip individual product */ }
    }
    return { count, error: count > 0 ? null : 'empty_response' };
  }

  // ── Strategy C: sitemap-discovered URLs ───────────────────────────────────
  // BUG FIX: previously re-fetched the ENTIRE sitemap for every failed collection.
  // Fix: fetch sitemap once per run (lazy-cached in sitemapHandlesCache).
  async function strategyC_sitemapUrls(
    collectionHandle: string,
  ): Promise<{ count: number; error: string | null }> {
    // Load sitemap handles once per run, not per collection
    if (sitemapHandlesCache === null) {
      sitemapHandlesCache = []; // mark as "attempted" even if empty
      const sitemapUrls = [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_products_1.xml`];

      for (const sitemapUrl of sitemapUrls) {
        if (storeAbort.signal.aborted) break;
        try {
          const { res } = await retryFetch(sitemapUrl, { Accept: 'text/xml,application/xml' }, `[C] sitemap`);
          if (res?.ok) {
            const text = await res.text();
            // Match /products/any-handle including uppercase and numbers
            const matches = text.match(/\/products\/([a-zA-Z0-9][a-zA-Z0-9\-_]+)/g) || [];
            sitemapHandlesCache = [...new Set(matches.map(m => m.replace('/products/', '').toLowerCase()))];
            await emitEvent({
              stage: 'sitemap_loaded', severity: 'info',
              message: `Sitemap loaded: ${sitemapHandlesCache.length} product handles cached for this run`,
              url: sitemapUrl, strategy_name: 'sitemap_urls',
            });
            break;
          }
          await res?.text().catch(() => {}); // consume
        } catch { /* try next URL */ }
      }
    }

    if (sitemapHandlesCache.length === 0) return { count: 0, error: 'empty_response' };

    let count = 0;
    for (const handle of sitemapHandlesCache) {
      // ── Hot-path abort checks ─────────────────────────────────────────────
      if (storeAbort.signal.aborted || collectionSkipAbort.signal.aborted) break;
      if (await isRunCancelled()) break;
      if (maxProducts > 0 && totalProducts >= maxProducts) break;
      try {
        const { res } = await retryFetch(`${baseUrl}/products/${handle}.json`, authHeaders, `[C] product ${handle}`);
        if (!res?.ok) { await res?.text().catch(() => {}); continue; }
        const d = await res.json();
        if (d?.product) { await processProduct(d.product, baseUrl, collectionHandle); count++; }
        const combined = combineAbortSignals(storeAbort.signal, collectionSkipAbort.signal);
        try { await sleep(1500, combined.signal); } catch { break; }
      } catch { /* skip */ }
    }
    return { count, error: count > 0 ? null : 'empty_response' };
  }

  // ── WooCommerce Strategy: REST API ────────────────────────────────────────
  async function strategyWC_restApi(
    page: number,
  ): Promise<{ count: number; error: string | null }> {
    const url = `${baseUrl}/wp-json/wc/v3/products?per_page=100&page=${page}`;
    const { res, error: fetchErr } = await retryFetch(url, authHeaders, `[WC] page ${page}`);
    if (!res || !res.ok) return { count: 0, error: fetchErr ?? `HTTP ${res?.status}` };
    let data: any;
    try { data = await res.json(); }
    catch { return { count: 0, error: 'invalid_json' }; }
    if (!Array.isArray(data)) return { count: 0, error: 'unexpected_wc_response' };

    for (const wcProduct of data) {
      if (storeAbort.signal.aborted || collectionSkipAbort.signal.aborted) break;
      // Normalise WC product to Shopify-like shape for processProduct
      const shopifyLike = {
        id: wcProduct.id,
        handle: wcProduct.slug,
        title: wcProduct.name,
        body_html: wcProduct.description,
        vendor: wcProduct.brands?.[0]?.name || null,
        product_type: wcProduct.categories?.[0]?.name || null,
        tags: wcProduct.tags?.map((t: any) => t.name).join(', ') || '',
        published_at: wcProduct.date_modified,
        created_at: wcProduct.date_created,
        updated_at: wcProduct.date_modified,
        images: wcProduct.images?.map((img: any) => ({ src: img.src })) || [],
        variants: [{
          id: wcProduct.id * 1000, // synthetic variant ID
          title: 'Default Title',
          price: wcProduct.price,
          compare_at_price: wcProduct.regular_price !== wcProduct.price ? wcProduct.regular_price : null,
          sku: wcProduct.sku,
          barcode: null,
        }],
        options: [],
      };
      await processProduct(shopifyLike, baseUrl, 'woocommerce');
    }
    return { count: data.length, error: null };
  }

  // ── Per-collection state machine ──────────────────────────────────────────
  async function scrapeCollection(
    col: { handle: string; title: string },
    platform: string,
    preferredStrategy: Strategy,
  ): Promise<CollectionState> {
    const t0 = Date.now();

    // Reset skip abort for this collection so previous skips don't carry over
    collectionSkipAbort = new AbortController();

    // Check skip before we even start
    if (await isCollectionSkipRequested()) {
      await supabaseAdmin.from('scrape_run_stores').update({ skip_requested: false }).eq('id', runStoreId);
      return 'skipped';
    }

    await updateProgress({ current_collection: col.handle, current_strategy: preferredStrategy });

    // ── Build strategy order based on platform ────────────────────────────
    // BUG FIX: actualStrategy was computed but never applied to strategy ordering.
    // Now we build the order from the detected platform.
    let strategyOrder: Strategy[];
    if (platform === 'woocommerce') {
      // WooCommerce: start with WC REST API, fall back to HTML
      strategyOrder = ['wc_api', 'collection_html', 'skip'];
    } else if (platform === 'shopify') {
      // Shopify: start with products.json, then HTML, then sitemap
      strategyOrder = ['products_json', 'collection_html', 'sitemap_urls', 'skip'];
    } else {
      // Unknown: try products.json first (might be Shopify), then HTML
      strategyOrder = ['products_json', 'collection_html', 'sitemap_urls', 'skip'];
    }

    for (const strategy of strategyOrder) {
      // ── Abort/cancel checks at every strategy boundary ────────────────────
      if (storeAbort.signal.aborted) {
        const reason = storeAbort.signal.reason;
        return reason === 'store_timeout' ? 'failed' : 'skipped';
      }
      if (await isRunCancelled()) return 'skipped';
      if (await isCollectionSkipRequested()) {
        collectionSkipAbort.abort('operator_skip');
        await supabaseAdmin.from('scrape_run_stores').update({ skip_requested: false }).eq('id', runStoreId);
        await emitEvent({
          stage: 'collection_skipped', severity: 'info',
          message: `${col.handle} skipped by operator`,
          collection_handle: col.handle, strategy_name: strategy,
          was_operator_action: true,
        });
        return 'skipped';
      }

      await updateProgress({ current_strategy: strategy });

      if (strategy === 'skip') {
        await emitEvent({
          stage: 'collection_skipped', severity: 'warning',
          message: `All strategies exhausted for ${col.handle} — skipped`,
          collection_handle: col.handle, strategy_name: 'skip',
          reason_code: 'max_retries_exceeded', duration_ms: Date.now() - t0,
        });
        return 'skipped';
      }

      if (strategy !== preferredStrategy) {
        await emitEvent({
          stage: 'strategy_fallback', severity: 'warning',
          message: `Falling back to ${strategy} for ${col.handle}`,
          collection_handle: col.handle, strategy_name: strategy,
          reason_code: 'strategy_fallback_success',
          was_auto_recovered: true, duration_ms: Date.now() - t0,
        });
      }

      let result: { count: number; error: string | null; autoRecovered?: boolean };

      if (strategy === 'products_json') {
        const colUrl = `${baseUrl}/collections/${col.handle}/products.json?limit=250`;
        result = await strategyA_productsJson(colUrl, col.handle);
      } else if (strategy === 'wc_api') {
        // WooCommerce: paginate through all pages
        let wcTotal = 0;
        let wcPage = 1;
        let wcError: string | null = null;
        while (true) {
          if (storeAbort.signal.aborted || collectionSkipAbort.signal.aborted) break;
          const r = await strategyWC_restApi(wcPage);
          if (r.error) { wcError = r.error; break; }
          if (r.count === 0) break; // no more products
          wcTotal += r.count;
          wcPage++;
          const combined = combineAbortSignals(storeAbort.signal, collectionSkipAbort.signal);
          try { await sleep(Math.max(interPageDelay, 2000), combined.signal); } catch { break; }
        }
        result = { count: wcTotal, error: wcTotal > 0 ? null : wcError };
      } else if (strategy === 'collection_html') {
        result = await strategyB_collectionHtml(col.handle);
      } else {
        result = await strategyC_sitemapUrls(col.handle);
      }

      // Operator skip/cancel mid-collection — don't count as failure
      if (result.error === 'operator_skipped' || result.error === 'store_aborted' || result.error === 'run_cancelled') {
        await emitEvent({
          stage: 'collection_skipped', severity: 'info',
          message: `${col.handle} aborted mid-collection (${result.error}) after ${result.count} products`,
          collection_handle: col.handle, strategy_name: strategy, was_operator_action: true,
          duration_ms: Date.now() - t0,
        });
        return 'skipped';
      }

      if (!result.error) {
        await emitEvent({
          stage: 'collection_completed', severity: 'info',
          message: `${col.handle} — ${result.count} products via ${strategy}`,
          collection_handle: col.handle, strategy_name: strategy,
          duration_ms: Date.now() - t0,
          was_auto_recovered: strategy !== preferredStrategy,
        });
        return 'success';
      }

      const reasonCode = classifyError(result.error);
      await emitEvent({
        stage: 'collection_strategy_failed', severity: 'warning',
        message: `${col.handle} — ${strategy} failed: ${result.error}`,
        collection_handle: col.handle, strategy_name: strategy,
        reason_code: reasonCode, raw_error: result.error,
        duration_ms: Date.now() - t0,
      });
    }

    return 'failed';
  }

  // ── Main run logic ────────────────────────────────────────────────────────
  let storeTerminal: StoreTerminal = 'completed';

  try {
    await emitEvent({ stage: 'run_started', severity: 'info', message: `Run started for ${store.name}` });

    // ── Detect + persist platform if still unknown ─────────────────────────
    let effectivePlatform = store.platform || 'unknown';
    if (effectivePlatform === 'unknown' || !effectivePlatform) {
      const detected = await detectStorePlatform(baseUrl);
      effectivePlatform = detected.platform;
      await supabaseAdmin.from('stores').update({
        platform: detected.platform,
        platform_confidence: detected.confidence,
      }).eq('id', storeId);
      await emitEvent({
        stage: 'platform_detected', severity: 'info',
        message: `Platform detected: ${detected.platform} (confidence: ${detected.confidence}) — evidence: ${detected.evidence.join(', ')}`,
        strategy_name: detected.platform,
      });
    }

    // ── Determine the preferred/starting strategy per platform ─────────────
    // BUG FIX: before this, actualStrategy was computed but never used.
    let preferredStrategy: Strategy;
    if (effectivePlatform === 'woocommerce') {
      preferredStrategy = 'wc_api';
    } else if (effectivePlatform === 'shopify') {
      preferredStrategy = 'products_json';
    } else {
      // Unknown: attempt products_json first (works for undetected Shopify stores)
      preferredStrategy = store.scrape_strategy === 'sitemap_handles' ? 'sitemap_urls' : 'products_json';
    }

    if (store.scrape_strategy === 'products_json' && effectivePlatform === 'woocommerce') {
      await emitEvent({
        stage: 'strategy_mismatch', severity: 'warning',
        message: `Strategy mismatch: store configured as products_json (Shopify) but detected as WooCommerce. Using wc_api.`,
        reason_code: 'strategy_fallback_success', was_auto_recovered: true,
      });
    }

    // ── Discover all collections ────────────────────────────────────────────
    let collections: Array<{ handle: string; title: string }> = [];

    if (effectivePlatform === 'woocommerce') {
      // WooCommerce uses a single "all products" virtual collection
      collections = [{ handle: 'all', title: 'All Products' }];
    } else {
      // Shopify/Unknown: paginate through /collections.json
      let colPage = 1;
      let colKeepGoing = true;
      while (colKeepGoing && !storeAbort.signal.aborted) {
        try {
          const colUrl = `${baseUrl}/collections.json?limit=250&page=${colPage}`;
          const { res } = await retryFetch(colUrl, authHeaders, 'collections.json');
          if (res?.ok) {
            const d = await res.json();
            if (Array.isArray(d.collections) && d.collections.length > 0) {
              collections.push(...d.collections.map((c: any) => ({ handle: c.handle, title: c.title })));
              colKeepGoing = d.collections.length === 250;
              colPage++;
            } else {
              colKeepGoing = false;
            }
          } else {
            await res?.text().catch(() => {}); // consume
            colKeepGoing = false;
          }
        } catch {
          colKeepGoing = false;
        }
      }

      // Fallback if no collections found
      if (collections.length === 0) {
        collections = [
          { handle: 'all', title: 'All Products' },
          { handle: 'frontpage', title: 'Front Page' },
        ];
        await emitEvent({
          stage: 'category_discovery_failed', severity: 'warning',
          message: `No collections via /collections.json — using fallback ['all', 'frontpage']`,
          url: `${baseUrl}/collections.json`,
        });
      } else {
        await emitEvent({
          stage: 'category_discovery_completed', severity: 'info',
          message: `Discovered ${collections.length} collections for ${store.name}`,
          url: `${baseUrl}/collections.json`,
        });
      }

      // Dedup
      const seen = new Set<string>();
      collections = collections.filter(c => seen.has(c.handle) ? false : (seen.add(c.handle), true));
    }

    await updateProgress({ collections_total: collections.length });

    // ── Scrape each collection through the state machine ──────────────────
    for (const col of collections) {
      if (storeAbort.signal.aborted) {
        storeTerminal = storeAbort.signal.reason === 'store_timeout' ? 'timed_out' : 'cancelled';
        break;
      }
      if (await isRunCancelled()) { storeTerminal = 'cancelled'; break; }
      if (maxProducts > 0 && totalProducts >= maxProducts) break;

      const colState = await scrapeCollection(col, effectivePlatform, preferredStrategy);

      if (colState === 'success') collectionsCompleted++;
      else if (colState === 'skipped') collectionsSkipped++;
      else collectionsFailed++;

      await updateProgress({
        collections_completed: collectionsCompleted,
        collections_skipped: collectionsSkipped,
        collections_failed: collectionsFailed,
        product_count: totalProducts,
      });

      if (!storeAbort.signal.aborted) {
        const combined = combineAbortSignals(storeAbort.signal);
        try { await sleep(INTER_COLLECTION_DELAY, combined.signal); } catch { /* aborted */ }
      }
    }

    // ── Batched quality summary events ────────────────────────────────────
    if (missingImage.length > 0) {
      await emitEvent({
        stage: 'image_missing_summary', severity: 'warning',
        message: `${missingImage.length} of ${totalProducts} products missing images for ${store.name}`,
        reason_code: 'no_images',
      });
    }
    if (missingPrice.length > 0) {
      await emitEvent({
        stage: 'price_missing_summary', severity: 'warning',
        message: `${missingPrice.length} of ${totalProducts} products missing prices for ${store.name}`,
        reason_code: 'no_variants_with_price',
      });
    }
    if (missingDesc.length > 0) {
      await emitEvent({
        stage: 'description_missing_summary', severity: 'warning',
        message: `${missingDesc.length} of ${totalProducts} products missing descriptions for ${store.name}`,
        reason_code: 'empty_body_html',
      });
    }

    if (storeTerminal === 'completed' && (collectionsSkipped > 0 || collectionsFailed > 0)) {
      storeTerminal = 'completed_with_skips';
    }

    // ── Persist store metrics ─────────────────────────────────────────────
    await supabaseAdmin.from('stores').update({
      last_scraped_at: new Date().toISOString(),
      total_products: totalProducts,
    }).eq('id', storeId);

    const { data: avgData } = await supabaseAdmin.from('products').select('price_min').eq('store_id', storeId).eq('user_id', userId);
    const avgPriceMin = avgData?.length ? avgData.reduce((a: number, p: any) => a + (p.price_min || 0), 0) / avgData.length : null;
    await supabaseAdmin.from('store_metrics_history').insert({
      user_id: userId, store_id: storeId, total_products: totalProducts,
      price_changes: totalPriceChanges, avg_price_min: avgPriceMin,
    });

    const statusMap: Record<StoreTerminal, string> = {
      completed: 'completed', completed_with_skips: 'completed',
      failed: 'error', cancelled: 'cancelled', timed_out: 'error',
    };

    await supabaseAdmin.from('scrape_run_stores').update({
      status: statusMap[storeTerminal],
      terminal_status: storeTerminal,
      finished_at: new Date().toISOString(),
      page_count: pagesVisited,
      product_count: totalProducts,
      price_changes: totalPriceChanges,
      current_collection: null,
      current_strategy: null,
      message: `${totalProducts} products · ${totalPriceChanges} price changes · ${collectionsCompleted} collections · ${collectionsSkipped} skipped`,
    }).eq('id', runStoreId);

    // Update run totals
    const { data: runData } = await supabaseAdmin.from('scrape_runs').select('total_products, total_price_changes, completed_stores, pages_visited').eq('id', scrapeRunId).maybeSingle();
    if (runData) {
      await supabaseAdmin.from('scrape_runs').update({
        total_products: (runData.total_products || 0) + totalProducts,
        total_price_changes: (runData.total_price_changes || 0) + totalPriceChanges,
        completed_stores: (runData.completed_stores || 0) + 1,
        pages_visited: (runData.pages_visited || 0) + pagesVisited,
        run_status: 'export_ready',
      }).eq('id', scrapeRunId);
    }

    await emitEvent({
      stage: 'run_completed', severity: 'info',
      message: `${store.name} ${storeTerminal}: ${totalProducts} products, ${collectionsCompleted} collections, ${collectionsSkipped} skipped, ${collectionsFailed} failed`,
    });

    clearTimeout(storeTimeout);
    return new Response(
      JSON.stringify({ success: true, totalProducts, totalPriceChanges, pagesVisited, collectionsCompleted, collectionsSkipped, collectionsFailed, storeTerminal, platform: effectivePlatform }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    clearTimeout(storeTimeout);
    const isAbort = (err as Error).name === 'AbortError' || storeAbort.signal.aborted;
    const terminal = isAbort ? (storeAbort.signal.reason === 'store_timeout' ? 'timed_out' : 'cancelled') : 'failed';
    const failureReasonCode = isAbort
      ? (storeAbort.signal.reason === 'store_timeout' ? 'store_timeout' : 'operator_cancelled')
      : classifyError(err);
    await emitEvent({
      stage: 'run_failed', severity: isAbort ? 'warning' : 'critical',
      message: `${store.name} ${terminal}: ${String(err)}`,
      raw_error: String(err), reason_code: failureReasonCode,
    });
    await supabaseAdmin.from('scrape_run_stores').update({
      status: 'error', terminal_status: terminal,
      finished_at: new Date().toISOString(),
      page_count: pagesVisited, product_count: totalProducts, price_changes: totalPriceChanges,
      message: String(err),
    }).eq('id', runStoreId);
    const { data: runData } = await supabaseAdmin.from('scrape_runs').select('error_count, completed_stores, pages_visited').eq('id', scrapeRunId).maybeSingle();
    if (runData) {
      await supabaseAdmin.from('scrape_runs').update({
        error_count: (runData.error_count || 0) + 1,
        completed_stores: (runData.completed_stores || 0) + 1,
        pages_visited: (runData.pages_visited || 0) + pagesVisited,
        run_status: isAbort ? 'cancelled' : 'failed',
      }).eq('id', scrapeRunId);
    }
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
