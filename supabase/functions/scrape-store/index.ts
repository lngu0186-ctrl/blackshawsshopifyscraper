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
const REQUEST_TIMEOUT_MS    = 20_000;
const COLLECTION_TIMEOUT_MS = 45_000;
const STORE_TIMEOUT_MS      = 10 * 60_000;
const BACKOFF_DELAYS        = [2_000, 5_000, 15_000];
const INTER_COLLECTION_DELAY = 2_500;

// ── Collection state machine ──────────────────────────────────────────────────
type CollectionState = 'queued' | 'running' | 'retrying' | 'fallback_strategy' | 'success' | 'skipped' | 'failed';
type StoreTerminal   = 'completed' | 'completed_with_skips' | 'failed' | 'cancelled' | 'timed_out';
type Strategy        = 'products_json' | 'collection_html' | 'sitemap_urls' | 'skip';

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
  const raw = [product.title||'', htmlToPlainText(product.body_html||''), product.tags||'',
    product.vendor||'', product.product_type||'', ...prices].join('|');
  return sha256(raw);
}
function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

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
  // +10 for scraped_at being set (always true for newly scraped products)
  score += 10;

  let status: string;
  const hasCriticalFlag = flags.includes('missing_price') || flags.includes('missing_image');
  if (score >= 80 && !hasCriticalFlag) status = 'ready';
  else if (score >= 80) status = 'review_required';
  else if (score >= 50) status = 'validated';
  else if (score >= 20) status = 'normalized';
  else status = 'discovered';

  return { score, status, flags };
}

// ── Fetch with AbortController + timeout ─────────────────────────────────────
async function fetchWithTimeout(url: string, extraHeaders: Record<string, string> = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { ...BASE_HEADERS, ...extraHeaders } });
    clearTimeout(t);
    return res;
  } catch (err) {
    clearTimeout(t);
    if ((err as Error).name === 'AbortError') throw new Error(`timeout:${url}`);
    throw err;
  }
}

// ── Categorise errors for reason_code ────────────────────────────────────────
function classifyError(err: unknown, status?: number): string {
  const msg = String(err);
  if (status === 429) return 'http_429';
  if (status === 503) return 'http_503';
  if (status && status >= 500) return `http_${status}`;
  if (status === 401 || status === 403) return `http_${status}`;
  if (msg.startsWith('timeout:')) return 'timeout';
  if (msg.includes('invalid json') || msg.includes('JSON')) return 'invalid_json';
  if (msg.includes('ECONNRESET') || msg.includes('network')) return 'network_error';
  return 'unknown_error';
}

// ── Retry with exponential backoff ────────────────────────────────────────────
async function retryFetch(
  url: string,
  extraHeaders: Record<string, string>,
  checkSkip: () => boolean,
  label: string,
): Promise<{ res: Response | null; error: string | null; reasonCode: string; attempt: number }> {
  let lastError = '';
  let reasonCode = 'unknown_error';
  for (let attempt = 0; attempt < BACKOFF_DELAYS.length + 1; attempt++) {
    if (checkSkip()) return { res: null, error: 'operator_skipped', reasonCode: 'operator_skipped', attempt };
    try {
      const res = await fetchWithTimeout(url, extraHeaders);
      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        reasonCode = classifyError(null, res.status);
        if (attempt < BACKOFF_DELAYS.length) {
          await sleep(BACKOFF_DELAYS[attempt]);
          continue;
        }
        return { res, error: lastError, reasonCode, attempt };
      }
      return { res, error: null, reasonCode: 'ok', attempt };
    } catch (err) {
      lastError = String(err);
      reasonCode = classifyError(err);
      if (attempt < BACKOFF_DELAYS.length) {
        await sleep(BACKOFF_DELAYS[attempt]);
      }
    }
  }
  return { res: null, error: lastError, reasonCode, attempt: BACKOFF_DELAYS.length };
}

// ── Platform detection helper ─────────────────────────────────────────────────
async function detectStorePlatform(baseUrl: string): Promise<{ platform: string; confidence: string }> {
  // Test 1: /products.json → high confidence Shopify
  try {
    const res = await fetchWithTimeout(`${baseUrl}/products.json?limit=1`, {}, 10_000);
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d.products)) return { platform: 'shopify', confidence: 'high' };
    }
  } catch { /* fall through */ }

  // Test 2: WooCommerce REST API
  try {
    const res = await fetchWithTimeout(`${baseUrl}/wp-json/wc/v3/products?per_page=1`, {}, 8_000);
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d)) return { platform: 'woocommerce', confidence: 'high' };
    }
  } catch { /* fall through */ }

  // Test 3: HTML heuristics
  try {
    const res = await fetchWithTimeout(baseUrl, { Accept: 'text/html' }, 10_000);
    if (res.ok) {
      const html = await res.text();
      if (html.includes('cdn.shopify.com') || html.includes('Shopify.theme') || /meta[^>]+generator[^>]+Shopify/i.test(html)) {
        return { platform: 'shopify', confidence: 'medium' };
      }
      if (html.includes('/wp-content/') || html.includes('woocommerce') || /meta[^>]+generator[^>]+WooCommerce/i.test(html)) {
        return { platform: 'woocommerce', confidence: 'medium' };
      }
    }
  } catch { /* fall through */ }

  return { platform: 'unknown', confidence: 'none' };
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
  const [storeRes, runStoreRes] = await Promise.all([
    supabaseAdmin.from('stores').select('*').eq('id', storeId).eq('user_id', userId).single(),
    supabaseAdmin.from('scrape_run_stores').select('*').eq('scrape_run_id', scrapeRunId).eq('store_id', storeId).single(),
  ]);
  if (storeRes.error || !storeRes.data) return new Response(JSON.stringify({ error: 'Store not found' }), { status: 404, headers: corsHeaders });
  if (runStoreRes.error || !runStoreRes.data) return new Response(JSON.stringify({ error: 'scrape_run_store not found' }), { status: 404, headers: corsHeaders });

  const store = storeRes.data;
  const runStore = runStoreRes.data;
  const runStoreId = runStore.id;
  const storeSlug = slugify(store.name);
  const baseUrl = store.normalized_url;

  // Store-level AbortController (for run cancellation / timeout)
  const storeAbort = new AbortController();
  const storeTimeout = setTimeout(() => storeAbort.abort('store_timeout'), STORE_TIMEOUT_MS);

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

  // ── Control checks ─────────────────────────────────────────────────────────
  async function isRunCancelled(): Promise<boolean> {
    const { data } = await supabaseAdmin.from('scrape_runs').select('status').eq('id', scrapeRunId).single();
    return data?.status === 'cancelled';
  }
  async function isCollectionSkipRequested(): Promise<boolean> {
    const { data } = await supabaseAdmin.from('scrape_run_stores').select('skip_requested').eq('id', runStoreId).single();
    return !!data?.skip_requested;
  }
  function isStoreAborted(): boolean { return storeAbort.signal.aborted; }

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

  async function log(level: string, message: string) {
    await supabaseAdmin.from('scrape_logs').insert({ scrape_run_id: scrapeRunId, user_id: userId, store_id: storeId, level, message });
  }

  // ── Update run_store progress fields ─────────────────────────────────────
  async function updateProgress(patch: Record<string, any>) {
    await supabaseAdmin.from('scrape_run_stores').update(patch).eq('id', runStoreId);
  }

  // ── Product persistence with inline confidence scoring ────────────────────
  async function processProduct(product: any, productBaseUrl: string, collectionHandle?: string) {
    const shopifyId = String(product.id);
    if (seenProductIds.has(shopifyId)) return;   // dedup by shopify product ID
    seenProductIds.add(shopifyId);

    const handle = product.handle || '';
    const storeHandle = `${storeSlug}-${handle}`;
    const bodyPlain = htmlToPlainText(product.body_html || '');
    const contentHash = await buildContentHash(product);
    const priceArr = (product.variants || []).map((v: any) => parseFloat(v.price) || 0).filter((p: number) => p > 0);
    const compareArr = (product.variants || []).map((v: any) => parseFloat(v.compare_at_price) || 0).filter((p: number) => p > 0);
    const priceMin = priceArr.length > 0 ? Math.min(...priceArr) : null;

    // Derive product_type from collection handle if not set
    const productType = product.product_type || (collectionHandle
      ? collectionHandle.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : null);

    // Check if any variant has a SKU or barcode
    const hasVariantWithSku = (product.variants || []).some((v: any) => v.sku || v.barcode);

    // Inline confidence scoring — no post-run backfill needed
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
      // Confidence scoring — set inline, not via post-run backfill
      confidence_score: score,
      product_scrape_status: status,
      issue_flags: flags,
    };

    // Batch quality issues silently — emit ONE summary event per store at end
    if (!priceMin) missingPrice.push(handle);
    if (!product.images || product.images.length === 0) missingImage.push(handle);
    if (!product.body_html || product.body_html.trim() === '') missingDesc.push(handle);

    const { data: existing } = await supabaseAdmin.from('products').select('id, content_hash, first_seen_at').eq('store_id', storeId).eq('handle', handle).single();
    const hashChanged = existing && existing.content_hash !== contentHash;
    const upsertData: any = { ...productData, first_seen_at: existing?.first_seen_at || new Date().toISOString() };
    if (hashChanged) upsertData.last_changed_at = new Date().toISOString();

    const { data: saved, error: productErr } = await supabaseAdmin.from('products').upsert(upsertData, { onConflict: 'store_id,handle' }).select('id').single();
    if (productErr || !saved) return;
    const productId = saved.id;

    // Process variants + price history
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
      const { data: upsertedVariant, error: variantErr } = await supabaseAdmin.from('product_variants').upsert(variantData, { onConflict: 'product_id,shopify_variant_id' }).select('id, price, compare_at_price').single();
      if (variantErr || !upsertedVariant) continue;

      const { data: latestHistory } = await supabaseAdmin.from('variant_price_history').select('price, compare_at_price').eq('variant_id', upsertedVariant.id).order('recorded_at', { ascending: false }).limit(1).single();
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
  async function strategyA_productsJson(
    endpointUrl: string,
    collectionHandle: string,
    checkSkip: () => boolean,
  ): Promise<{ count: number; error: string | null; autoRecovered?: boolean }> {
    let page = 1;
    let nextUrl: string | null = endpointUrl;
    let useLinkHeader = true;
    let count = 0;
    const t0 = Date.now();

    while (nextUrl) {
      if (checkSkip() || await isRunCancelled()) break;
      if (Date.now() - t0 > COLLECTION_TIMEOUT_MS) {
        return { count, error: 'timeout:collection', autoRecovered: false };
      }

      const { res, error: fetchErr, reasonCode, attempt } = await retryFetch(nextUrl, authHeaders, checkSkip, `[A] ${collectionHandle} p${page}`);
      if (!res) return { count, error: fetchErr ?? 'no_response', autoRecovered: false };
      if (!res.ok) return { count, error: `HTTP ${res.status}`, autoRecovered: false };

      let data: any;
      try { data = await res.json(); }
      catch { return { count, error: 'invalid_json', autoRecovered: false }; }

      const products: any[] = data.products || [];
      pagesVisited++;
      count += products.length;

      await emitEvent({
        stage: 'page_fetched', severity: 'info',
        message: `[A] ${collectionHandle} — page ${page} — ${products.length} products`,
        url: nextUrl, collection_handle: collectionHandle, strategy_name: 'products_json',
        attempt_number: attempt, duration_ms: Date.now() - t0,
      });
      // Increment pages_visited on the run record
      await supabaseAdmin.from('scrape_runs').update({ pages_visited: pagesVisited }).eq('id', scrapeRunId);

      if (products.length === 0) break;

      for (const product of products) {
        if (checkSkip()) break;
        if (maxProducts > 0 && totalProducts >= maxProducts) { nextUrl = null; break; }
        await processProduct(product, baseUrl, collectionHandle);
      }

      // Advance pagination: prefer Link header, fall back to ?page=N
      const linkHeader = res.headers.get('link') || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch && useLinkHeader) {
        nextUrl = nextMatch[1];
      } else if (products.length === 250 && useLinkHeader && !nextMatch) {
        useLinkHeader = false; page = 2;
        nextUrl = `${endpointUrl.split('?')[0]}?limit=250&page=${page}`;
      } else if (products.length === 250 && !useLinkHeader) {
        page++;
        nextUrl = `${endpointUrl.split('?')[0]}?limit=250&page=${page}`;
      } else {
        nextUrl = null;
      }

      if (nextUrl) await sleep(Math.max(interPageDelay, 2000));
      page++;
    }

    return { count, error: null, autoRecovered: false };
  }

  // ── Strategy B: HTML collection page — extract product links ─────────────
  async function strategyB_collectionHtml(
    collectionHandle: string,
    checkSkip: () => boolean,
  ): Promise<{ count: number; error: string | null }> {
    const url = `${baseUrl}/collections/${collectionHandle}`;
    const { res, error: fetchErr } = await retryFetch(url, { ...authHeaders, Accept: 'text/html' }, checkSkip, `[B] ${collectionHandle}`);
    if (!res || !res.ok) return { count: 0, error: fetchErr ?? `HTTP ${res?.status}` };

    const html = await res.text();
    // Extract product handles from href="/products/handle"
    const handleMatches = [...html.matchAll(/href="\/products\/([a-z0-9\-_]+)"/g)].map(m => m[1]);
    const uniqueHandles = [...new Set(handleMatches)];
    if (uniqueHandles.length === 0) return { count: 0, error: 'selector_missing' };

    let count = 0;
    for (const handle of uniqueHandles) {
      if (checkSkip()) break;
      try {
        const productUrl = `${baseUrl}/products/${handle}.json`;
        const { res: pRes } = await retryFetch(productUrl, authHeaders, checkSkip, `[B] product ${handle}`);
        if (!pRes || !pRes.ok) continue;
        const d = await pRes.json();
        if (d?.product) { await processProduct(d.product, baseUrl, collectionHandle); count++; }
        await sleep(1500);
      } catch { /* skip individual */ }
    }
    return { count, error: count > 0 ? null : 'empty_response' };
  }

  // ── Strategy C: sitemap-discovered URLs ───────────────────────────────────
  async function strategyC_sitemapUrls(
    collectionHandle: string,
    checkSkip: () => boolean,
  ): Promise<{ count: number; error: string | null }> {
    const sitemapUrls = [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_products_1.xml`];
    let productHandles: string[] = [];

    for (const sitemapUrl of sitemapUrls) {
      try {
        const { res } = await retryFetch(sitemapUrl, { Accept: 'text/xml,application/xml' }, checkSkip, `[C] sitemap`);
        if (res?.ok) {
          const text = await res.text();
          const matches = text.match(/\/products\/([a-z0-9\-_]+)/g) || [];
          productHandles = [...new Set(matches.map(m => m.replace('/products/', '')))];
          break;
        }
      } catch { /* try next */ }
    }

    if (productHandles.length === 0) return { count: 0, error: 'empty_response' };

    let count = 0;
    for (const handle of productHandles) {
      if (checkSkip() || (maxProducts > 0 && totalProducts >= maxProducts)) break;
      try {
        const { res } = await retryFetch(`${baseUrl}/products/${handle}.json`, authHeaders, checkSkip, `[C] product ${handle}`);
        if (!res?.ok) continue;
        const d = await res.json();
        if (d?.product) { await processProduct(d.product, baseUrl, collectionHandle); count++; }
        await sleep(1500);
      } catch { /* skip */ }
    }
    return { count, error: count > 0 ? null : 'empty_response' };
  }

  // ── Per-collection state machine ──────────────────────────────────────────
  async function scrapeCollection(col: { handle: string; title: string }): Promise<CollectionState> {
    const t0 = Date.now();
    let currentStrategy: Strategy = 'products_json';

    // Check skip before we even start
    if (await isCollectionSkipRequested()) {
      await supabaseAdmin.from('scrape_run_stores').update({ skip_requested: false }).eq('id', runStoreId);
      return 'skipped';
    }

    await updateProgress({ current_collection: col.handle, current_strategy: 'products_json' });

    const strategies: Strategy[] = ['products_json', 'collection_html', 'sitemap_urls', 'skip'];

    for (const strategy of strategies) {
      if (isStoreAborted() || await isRunCancelled()) return 'skipped';

      // Check operator skip between strategy attempts
      if (await isCollectionSkipRequested()) {
        await supabaseAdmin.from('scrape_run_stores').update({ skip_requested: false }).eq('id', runStoreId);
        await emitEvent({
          stage: 'collection_skipped', severity: 'info',
          message: `${col.handle} skipped by operator after trying ${currentStrategy}`,
          collection_handle: col.handle, strategy_name: strategy,
          was_operator_action: true,
        });
        return 'skipped';
      }

      currentStrategy = strategy;
      await updateProgress({ current_strategy: strategy });

      if (strategy === 'skip') {
        await emitEvent({
          stage: 'collection_skipped', severity: 'warning',
          message: `All strategies exhausted for ${col.handle} — marking as skipped`,
          collection_handle: col.handle, strategy_name: 'skip',
          reason_code: 'max_retries_exceeded', duration_ms: Date.now() - t0,
        });
        return 'skipped';
      }

      if (strategy !== 'products_json') {
        await emitEvent({
          stage: 'strategy_fallback', severity: 'warning',
          message: `Falling back to ${strategy} for collection ${col.handle}`,
          collection_handle: col.handle, strategy_name: strategy,
          reason_code: 'strategy_fallback_success',
          was_auto_recovered: true, duration_ms: Date.now() - t0,
        });
      }

      const checkSkip = () => isStoreAborted();

      let result: { count: number; error: string | null; autoRecovered?: boolean };
      if (strategy === 'products_json') {
        const colUrl = `${baseUrl}/collections/${col.handle}/products.json?limit=250`;
        result = await strategyA_productsJson(colUrl, col.handle, checkSkip);
      } else if (strategy === 'collection_html') {
        result = await strategyB_collectionHtml(col.handle, checkSkip);
      } else {
        result = await strategyC_sitemapUrls(col.handle, checkSkip);
      }

      if (!result.error) {
        const wasRecovered = strategy !== 'products_json';
        await emitEvent({
          stage: 'collection_completed', severity: 'info',
          message: `${col.handle} — ${result.count} products via ${strategy}`,
          collection_handle: col.handle, strategy_name: strategy,
          duration_ms: Date.now() - t0,
          was_auto_recovered: wasRecovered,
        });
        return 'success';
      }

      // Error — log it and try next strategy
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
    await emitEvent({ stage: 'run_started', severity: 'info', message: `Run started for ${store.name}`, strategy_name: 'products_json' });

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
        message: `Platform detected: ${detected.platform} (confidence: ${detected.confidence})`,
        strategy_name: detected.platform,
      });
    }

    // ── Validate strategy vs platform ──────────────────────────────────────
    // If platform is NOT Shopify, products_json will return empty — warn and adjust
    let actualStrategy = store.scrape_strategy;
    if (effectivePlatform === 'woocommerce' && actualStrategy === 'products_json') {
      await emitEvent({
        stage: 'strategy_mismatch', severity: 'warning',
        message: `Store uses WooCommerce but strategy is products_json (Shopify). Switching to collection_html fallback.`,
        reason_code: 'strategy_fallback_success', was_auto_recovered: true,
      });
      actualStrategy = 'collection_html';
    }

    // ── Discover all collections ────────────────────────────────────────────
    const collectionsUrl = `${baseUrl}/collections.json?limit=250`;
    let collections: Array<{ handle: string; title: string }> = [];

    // Paginate through collections.json (stores can have 250+ collections)
    let colPage = 1;
    let colKeepGoing = true;
    while (colKeepGoing && !isStoreAborted()) {
      try {
        const colUrl = `${collectionsUrl}&page=${colPage}`;
        const { res } = await retryFetch(colUrl, authHeaders, () => isStoreAborted(), 'collections.json');
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
          colKeepGoing = false;
        }
      } catch {
        colKeepGoing = false;
      }
    }

    // Fallback: if no collections found, use defaults + products.json flat
    if (collections.length === 0) {
      collections = [
        { handle: 'all', title: 'All Products' },
        { handle: 'frontpage', title: 'Front Page' },
      ];
      await emitEvent({
        stage: 'category_discovery_failed', severity: 'warning',
        message: `No collections discovered via /collections.json — using fallback ['all', 'frontpage']`,
        url: collectionsUrl,
      });
    } else {
      await emitEvent({
        stage: 'category_discovery_completed', severity: 'info',
        message: `Discovered ${collections.length} collections for ${store.name}`,
        url: collectionsUrl,
      });
    }

    // Dedup collections by handle (safety)
    const seen = new Set<string>();
    collections = collections.filter(c => seen.has(c.handle) ? false : (seen.add(c.handle), true));

    await updateProgress({ collections_total: collections.length });

    // ── Scrape each collection through the state machine ──────────────────
    for (const col of collections) {
      if (isStoreAborted()) {
        const abortReason = storeAbort.signal.reason;
        storeTerminal = abortReason === 'store_timeout' ? 'timed_out' : 'cancelled';
        break;
      }
      if (await isRunCancelled()) { storeTerminal = 'cancelled'; break; }
      if (maxProducts > 0 && totalProducts >= maxProducts) break;

      const colState = await scrapeCollection(col);

      if (colState === 'success') collectionsCompleted++;
      else if (colState === 'skipped') collectionsSkipped++;
      else collectionsFailed++;

      await updateProgress({
        collections_completed: collectionsCompleted,
        collections_skipped: collectionsSkipped,
        collections_failed: collectionsFailed,
      });

      // Inter-collection delay to avoid rate limiting
      if (!isStoreAborted()) await sleep(INTER_COLLECTION_DELAY);
    }

    // ── Batched quality summary events (not per-product) ─────────────────
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

    // Determine final terminal status
    if (storeTerminal === 'completed' && (collectionsSkipped > 0 || collectionsFailed > 0)) {
      storeTerminal = 'completed_with_skips';
    }

    // ── Persist store + metrics ───────────────────────────────────────────
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
    const { data: runData } = await supabaseAdmin.from('scrape_runs').select('total_products, total_price_changes, completed_stores, pages_visited').eq('id', scrapeRunId).single();
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
      strategy_name: storeTerminal,
    });

    clearTimeout(storeTimeout);
    return new Response(
      JSON.stringify({ success: true, totalProducts, totalPriceChanges, pagesVisited, collectionsCompleted, collectionsSkipped, collectionsFailed, storeTerminal, platform: effectivePlatform }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    clearTimeout(storeTimeout);
    await emitEvent({
      stage: 'run_failed', severity: 'critical',
      message: `Fatal error in ${store.name}: ${String(err)}`,
      raw_error: String(err), reason_code: 'unknown_error',
    });
    await supabaseAdmin.from('scrape_run_stores').update({
      status: 'error', terminal_status: 'failed',
      finished_at: new Date().toISOString(),
      page_count: pagesVisited, product_count: totalProducts, price_changes: totalPriceChanges,
      message: String(err),
    }).eq('id', runStoreId);
    const { data: runData } = await supabaseAdmin.from('scrape_runs').select('error_count, completed_stores, pages_visited').eq('id', scrapeRunId).single();
    if (runData) {
      await supabaseAdmin.from('scrape_runs').update({
        error_count: (runData.error_count || 0) + 1,
        completed_stores: (runData.completed_stores || 0) + 1,
        pages_visited: (runData.pages_visited || 0) + pagesVisited,
        run_status: 'failed',
      }).eq('id', scrapeRunId);
    }
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
