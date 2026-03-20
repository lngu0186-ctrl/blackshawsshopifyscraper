import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AUPharmacyScout/1.0)',
  'Accept': 'application/json, text/html;q=0.9',
  'Accept-Language': 'en-AU,en;q=0.9',
};

// ---- Helpers ----
function slugify(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function htmlToPlainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function md5(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function buildContentHash(product: any): Promise<string> {
  const variants = product.variants || [];
  const prices = [...variants.map((v: any) => String(v.price || ''))].sort();
  const skus = [...variants.map((v: any) => String(v.sku || ''))].sort();
  const images = [...(product.images || []).map((i: any) => String(i.src || ''))].sort();
  const raw = [
    product.title || '',
    htmlToPlainText(product.body_html || ''),
    product.tags || '',
    product.vendor || '',
    product.product_type || '',
    ...prices,
    ...skus,
    ...images,
  ].join('|');
  return md5(raw);
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, extraHeaders: Record<string, string> = {}, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { ...BASE_SCRAPE_HEADERS, ...extraHeaders },
      });
      clearTimeout(timeout);
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const backoff = (Math.pow(2, attempt) * 500) + Math.floor(Math.random() * 200);
        await sleep(backoff);
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        const backoff = (Math.pow(2, attempt) * 500) + Math.floor(Math.random() * 200);
        await sleep(backoff);
      }
    }
  }
  throw lastError || new Error('Max retries exceeded');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: userData, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }
  const userId = userData.user.id;

  const { scrapeRunId, storeId, interPageDelay = 500, maxProducts = 0 } = await req.json();

  if (!scrapeRunId || !storeId) {
    return new Response(JSON.stringify({ error: 'scrapeRunId and storeId required' }), { status: 400, headers: corsHeaders });
  }

  // Fetch store
  const { data: store, error: storeErr } = await supabaseAdmin
    .from('stores').select('*').eq('id', storeId).eq('user_id', userId).single();
  if (storeErr || !store) {
    return new Response(JSON.stringify({ error: 'Store not found' }), { status: 404, headers: corsHeaders });
  }

  // Get scrape_run_store row
  const { data: runStore, error: runStoreErr } = await supabaseAdmin
    .from('scrape_run_stores').select('*').eq('scrape_run_id', scrapeRunId).eq('store_id', storeId).single();
  if (runStoreErr || !runStore) {
    return new Response(JSON.stringify({ error: 'scrape_run_store not found' }), { status: 404, headers: corsHeaders });
  }

  const runStoreId = runStore.id;
  const storeSlug = slugify(store.name);
  const baseUrl = store.normalized_url;
  const scrapeStrategy: string = store.scrape_strategy || 'products_json';

  // Mark as fetching
  await supabaseAdmin.from('scrape_run_stores').update({ status: 'fetching', started_at: new Date().toISOString() }).eq('id', runStoreId);

  async function log(level: string, message: string, metadata?: any) {
    await supabaseAdmin.from('scrape_logs').insert({
      scrape_run_id: scrapeRunId,
      user_id: userId,
      store_id: storeId,
      level,
      message,
      metadata: metadata || null,
    });
  }

  async function checkCancelled(): Promise<boolean> {
    const { data } = await supabaseAdmin.from('scrape_runs').select('status').eq('id', scrapeRunId).single();
    return data?.status === 'cancelled';
  }

  // Build auth cookie header if needed
  let authHeaders: Record<string, string> = {};
  if (store.requires_auth && store.auth_cookie) {
    const cookieExpiry = store.auth_cookie_expires_at ? new Date(store.auth_cookie_expires_at) : null;
    const now = new Date();
    if (cookieExpiry && cookieExpiry < now) {
      await log('warn', `Auth cookie for ${store.name} expired. Re-authenticating before scrape.`);
      // Re-authenticate
      const reAuthResult = await reAuthenticate(store, supabaseAdmin, userId);
      if (reAuthResult.success && reAuthResult.auth_cookie) {
        authHeaders = { Cookie: reAuthResult.auth_cookie };
      } else {
        await log('error', `Auth failed for ${store.name}: ${reAuthResult.message}`);
        await supabaseAdmin.from('scrape_run_stores').update({
          status: 'error',
          finished_at: new Date().toISOString(),
          message: 'Authentication failed. Please update credentials.',
        }).eq('id', runStoreId);
        return new Response(JSON.stringify({ success: false, error: 'Authentication failed' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      authHeaders = { Cookie: store.auth_cookie };
    }
  }

  async function reAuthenticate(storeData: any, adminClient: any, uid: string): Promise<{ success: boolean; auth_cookie: string | null; message: string }> {
    const authType = storeData.auth_type || 'storefront_password';
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/auth-store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({
          store_id: storeData.id,
          url: storeData.normalized_url,
          auth_type: authType,
          password: storeData.storefront_password || storeData.auth_password,
          email: storeData.auth_email,
        }),
      });
      const result = await res.json();
      return { success: result.success, auth_cookie: null, message: result.message };
    } catch (e) {
      return { success: false, auth_cookie: null, message: String(e) };
    }
  }

  let totalProducts = 0;
  let totalPriceChanges = 0;
  let pageCount = 0;

  async function processProduct(product: any, productBaseUrl: string) {
    const handle = product.handle || '';
    const storeHandle = `${storeSlug}-${handle}`;
    const bodyPlain = htmlToPlainText(product.body_html || '');
    const contentHash = await buildContentHash(product);
    const priceArr = (product.variants || []).map((v: any) => parseFloat(v.price) || 0).filter((p: number) => p > 0);
    const compareArr = (product.variants || []).map((v: any) => parseFloat(v.compare_at_price) || 0).filter((p: number) => p > 0);

    const productData = {
      user_id: userId,
      store_id: storeId,
      store_name: store.name,
      store_slug: storeSlug,
      handle,
      store_handle: storeHandle,
      title: product.title || '',
      body_html: product.body_html || null,
      body_plain: bodyPlain || null,
      vendor: product.vendor || null,
      product_type: product.product_type || null,
      tags: Array.isArray(product.tags) ? product.tags.join(', ') : (product.tags || null),
      published: product.published_at != null,
      status: 'active',
      url: `${productBaseUrl}/products/${handle}`,
      images: product.images || [],
      options: product.options || [],
      raw_product: product,
      price_min: priceArr.length > 0 ? Math.min(...priceArr) : null,
      price_max: priceArr.length > 0 ? Math.max(...priceArr) : null,
      compare_at_price_min: compareArr.length > 0 ? Math.min(...compareArr) : null,
      compare_at_price_max: compareArr.length > 0 ? Math.max(...compareArr) : null,
      shopify_product_id: String(product.id),
      shopify_created_at: product.created_at || null,
      shopify_updated_at: product.updated_at || null,
      shopify_published_at: product.published_at || null,
      scraped_at: new Date().toISOString(),
      content_hash: contentHash,
    };

    const { data: existingProduct } = await supabaseAdmin
      .from('products').select('id, content_hash, first_seen_at').eq('store_id', storeId).eq('handle', handle).single();

    const hashChanged = existingProduct && existingProduct.content_hash !== contentHash;
    const upsertData: any = {
      ...productData,
      first_seen_at: existingProduct?.first_seen_at || new Date().toISOString(),
    };
    if (hashChanged) upsertData.last_changed_at = new Date().toISOString();

    const { data: upsertedProduct, error: productErr } = await supabaseAdmin
      .from('products')
      .upsert(upsertData, { onConflict: 'store_id,handle' })
      .select('id').single();

    if (productErr || !upsertedProduct) {
      await log('warn', `Failed to upsert product ${handle}: ${productErr?.message}`);
      return;
    }

    const productId = upsertedProduct.id;

    for (const variant of product.variants || []) {
      const variantData = {
        user_id: userId,
        product_id: productId,
        store_id: storeId,
        shopify_variant_id: String(variant.id),
        variant_position: variant.position || null,
        variant_title: variant.title || null,
        sku: variant.sku || null,
        barcode: variant.barcode || null,
        option1: variant.option1 || null,
        option2: variant.option2 || null,
        option3: variant.option3 || null,
        price: variant.price ? parseFloat(variant.price) : null,
        compare_at_price: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
        grams: variant.grams || 0,
        taxable: variant.taxable !== false,
        requires_shipping: variant.requires_shipping !== false,
        fulfillment_service: variant.fulfillment_service || 'manual',
        inventory_policy: variant.inventory_policy || 'deny',
        inventory_tracker: variant.inventory_management || null,
        inventory_quantity: variant.inventory_quantity || 0,
        featured_image_url: variant.featured_image?.src || null,
        raw_variant: variant,
      };

      const { data: upsertedVariant, error: variantErr } = await supabaseAdmin
        .from('product_variants')
        .upsert(variantData, { onConflict: 'product_id,shopify_variant_id' })
        .select('id, price, compare_at_price').single();

      if (variantErr || !upsertedVariant) {
        await log('warn', `Failed to upsert variant ${variant.id}: ${variantErr?.message}`);
        continue;
      }

      const { data: latestHistory } = await supabaseAdmin
        .from('variant_price_history')
        .select('price, compare_at_price')
        .eq('variant_id', upsertedVariant.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();

      const newPrice = upsertedVariant.price;
      const newCompareAt = upsertedVariant.compare_at_price;

      if (!latestHistory) {
        await supabaseAdmin.from('variant_price_history').insert({
          user_id: userId,
          product_id: productId,
          variant_id: upsertedVariant.id,
          store_id: storeId,
          store_handle: storeHandle,
          shopify_variant_id: String(variant.id),
          variant_sku: variant.sku || null,
          variant_title: variant.title || null,
          price: newPrice,
          compare_at_price: newCompareAt,
          previous_price: null,
          previous_compare_at_price: null,
          price_delta: null,
          price_delta_pct: null,
          compare_at_price_delta: null,
          price_changed: false,
          compare_at_price_changed: false,
          scrape_run_id: scrapeRunId,
        });
      } else {
        const priceChanged = latestHistory.price !== newPrice;
        const compareChanged = latestHistory.compare_at_price !== newCompareAt;

        if (priceChanged || compareChanged) {
          const delta = newPrice != null && latestHistory.price != null ? newPrice - latestHistory.price : null;
          const deltaPct = delta != null && latestHistory.price != null && latestHistory.price !== 0
            ? delta / latestHistory.price : null;
          const compareDelta = newCompareAt != null && latestHistory.compare_at_price != null
            ? newCompareAt - latestHistory.compare_at_price : null;

          await supabaseAdmin.from('variant_price_history').insert({
            user_id: userId,
            product_id: productId,
            variant_id: upsertedVariant.id,
            store_id: storeId,
            store_handle: storeHandle,
            shopify_variant_id: String(variant.id),
            variant_sku: variant.sku || null,
            variant_title: variant.title || null,
            price: newPrice,
            compare_at_price: newCompareAt,
            previous_price: latestHistory.price,
            previous_compare_at_price: latestHistory.compare_at_price,
            price_delta: delta,
            price_delta_pct: deltaPct,
            compare_at_price_delta: compareDelta,
            price_changed: priceChanged,
            compare_at_price_changed: compareChanged,
            scrape_run_id: scrapeRunId,
          });

          if (priceChanged) {
            totalPriceChanges++;
            const oldPriceStr = latestHistory.price != null ? `$${Number(latestHistory.price).toFixed(2)}` : 'N/A';
            const newPriceStr = newPrice != null ? `$${Number(newPrice).toFixed(2)}` : 'N/A';
            const pctStr = deltaPct != null ? ` (${(deltaPct * 100).toFixed(1)}%)` : '';
            await log('price_change',
              `${product.title} — ${variant.title}: ${oldPriceStr} → ${newPriceStr}${pctStr}`,
              { product_id: productId, variant_id: upsertedVariant.id, old_price: latestHistory.price, new_price: newPrice, delta, delta_pct: deltaPct, store_handle: storeHandle }
            );
          }
        }
      }
    }

    totalProducts++;
  }

  try {
    await log('info', `Probing ${store.name} — using ${scrapeStrategy} strategy`);

    // ── Strategy: password_protected ─ authenticate first, then use resolved strategy ──
    let effectiveStrategy = scrapeStrategy;
    if (scrapeStrategy === 'password_protected') {
      await log('info', `Store is password-protected. Authenticating with saved credentials.`);
      if (!store.auth_cookie) {
        throw new Error('No auth cookie found. Please re-authenticate the store before scraping.');
      }
      // Use the auth_cookie; resolved strategy comes from the store record after auth
      effectiveStrategy = 'products_json'; // Default; override if store has explicit collections_json
    }

    // ── Strategy: products_json ────────────────────────────────────────────────
    if (effectiveStrategy === 'products_json' || effectiveStrategy === 'password_protected') {
      let nextUrl: string | null = `${baseUrl}/products.json?limit=250`;
      let useLinkHeader = true;
      let page = 1;

      while (nextUrl) {
        if (await checkCancelled()) {
          await log('info', `Scrape cancelled at page ${page}`);
          await supabaseAdmin.from('scrape_run_stores').update({
            status: 'cancelled', finished_at: new Date().toISOString(), page_count: pageCount,
            product_count: totalProducts, price_changes: totalPriceChanges,
          }).eq('id', runStoreId);
          return new Response(JSON.stringify({ cancelled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        await log('info', `strategy: ${effectiveStrategy} — fetching page ${page} — ${totalProducts} products`);

        let response: Response;
        try {
          response = await fetchWithRetry(nextUrl, authHeaders);
        } catch (err) {
          await log('error', `Failed to fetch page ${page}: ${String(err)}`);
          throw err;
        }

        // 404 means no products at this URL — treat as empty, not an error
        if (response.status === 404) {
          await log('info', `products.json returned 404 on page ${page} — treating as no products`);
          break;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status} on page ${page}`);

        const data = await response.json();
        const products: any[] = data.products || [];
        pageCount++;

        if (products.length === 0) break;

        const linkHeader = response.headers.get('link') || '';
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch && useLinkHeader) {
          nextUrl = nextMatch[1];
        } else if (products.length === 250 && !useLinkHeader) {
          page++;
          nextUrl = `${baseUrl}/products.json?limit=250&page=${page}`;
        } else if (products.length === 250 && useLinkHeader && !nextMatch) {
          useLinkHeader = false;
          page = 2;
          nextUrl = `${baseUrl}/products.json?limit=250&page=${page}`;
        } else {
          nextUrl = null;
        }

        for (const product of products) {
          if (maxProducts > 0 && totalProducts >= maxProducts) { nextUrl = null; break; }
          await processProduct(product, baseUrl);
        }

        if (nextUrl) await sleep(interPageDelay);
      }
    }

    // ── Strategy: collections_json ────────────────────────────────────────────
    else if (effectiveStrategy === 'collections_json') {
      const collectionBases = [`${baseUrl}/collections/all/products.json`, `${baseUrl}/collections/frontpage/products.json`];
      let successBase: string | null = null;

      for (const base of collectionBases) {
        try {
          const probe = await fetchWithRetry(`${base}?limit=1`, authHeaders);
          if (probe.ok) {
            const d = await probe.json();
            if (d && Array.isArray(d.products)) { successBase = base; break; }
          }
        } catch { /* try next */ }
      }

      if (!successBase) throw new Error('collections_json: neither all nor frontpage collection accessible');

      let page = 1;
      let nextUrl: string | null = `${successBase}?limit=250`;
      let useLinkHeader = true;

      while (nextUrl) {
        if (await checkCancelled()) {
          await supabaseAdmin.from('scrape_run_stores').update({
            status: 'cancelled', finished_at: new Date().toISOString(), page_count: pageCount,
            product_count: totalProducts, price_changes: totalPriceChanges,
          }).eq('id', runStoreId);
          return new Response(JSON.stringify({ cancelled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        await log('info', `strategy: collections_json — fetching page ${page} — ${totalProducts} products`);

        const response = await fetchWithRetry(nextUrl, authHeaders);
        if (response.status === 404) {
          await log('info', `collections_json returned 404 on page ${page} — treating as no products`);
          break;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status} on page ${page}`);

        const data = await response.json();
        const products: any[] = data.products || [];
        pageCount++;

        if (products.length === 0) break;

        const linkHeader = response.headers.get('link') || '';
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch && useLinkHeader) {
          nextUrl = nextMatch[1];
        } else if (products.length === 250 && !useLinkHeader) {
          page++;
          nextUrl = `${successBase}?limit=250&page=${page}`;
        } else if (products.length === 250 && useLinkHeader && !nextMatch) {
          useLinkHeader = false;
          page = 2;
          nextUrl = `${successBase}?limit=250&page=${page}`;
        } else {
          nextUrl = null;
        }

        for (const product of products) {
          if (maxProducts > 0 && totalProducts >= maxProducts) { nextUrl = null; break; }
          await processProduct(product, baseUrl);
        }

        if (nextUrl) await sleep(interPageDelay);
      }
    }

    // ── Strategy: sitemap_handles ─────────────────────────────────────────────
    else if (effectiveStrategy === 'sitemap_handles') {
      await log('warn', `Sitemap strategy active for ${store.name} — fetching handles individually (slow)`);

      const sitemapRes = await fetchWithRetry(`${baseUrl}/sitemap.xml`, {
        ...authHeaders,
        Accept: 'text/xml,application/xml;q=0.9',
      });

      if (!sitemapRes.ok) throw new Error(`Could not fetch sitemap: HTTP ${sitemapRes.status}`);

      const sitemapText = await sitemapRes.text();
      const handleMatches = sitemapText.match(/\/products\/([a-z0-9\-]+)/g) || [];
      const uniqueHandles = [...new Set(handleMatches.map(m => m.replace('/products/', '')))];

      await log('warn', `Sitemap strategy: found ${uniqueHandles.length} handles, fetching individually (slow)`);

      const totalHandles = uniqueHandles.length;
      let handleIndex = 0;

      for (const handle of uniqueHandles) {
        if (maxProducts > 0 && totalProducts >= maxProducts) break;
        if (await checkCancelled()) {
          await supabaseAdmin.from('scrape_run_stores').update({
            status: 'cancelled', finished_at: new Date().toISOString(), page_count: pageCount,
            product_count: totalProducts, price_changes: totalPriceChanges,
          }).eq('id', runStoreId);
          return new Response(JSON.stringify({ cancelled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        handleIndex++;
        await log('info', `strategy: sitemap_handles — fetching handle ${handleIndex}/${totalHandles}`);

        try {
          const productUrl = `${baseUrl}/products/${handle}.json`;
          const productRes = await fetchWithRetry(productUrl, authHeaders);
          if (!productRes.ok) continue;

          const productData = await productRes.json();
          if (!productData?.product) continue;

          pageCount++;
          await processProduct(productData.product, baseUrl);
        } catch (err) {
          await log('warn', `Sitemap: failed to fetch handle ${handle}: ${String(err)}`);
        }

        // Rate limit: ~2 req/sec
        await sleep(Math.max(interPageDelay, 500));
      }
    }

    // ── Finalize ─────────────────────────────────────────────────────────────
    await supabaseAdmin.from('stores').update({
      last_scraped_at: new Date().toISOString(),
      total_products: totalProducts,
    }).eq('id', storeId);

    const { data: avgData } = await supabaseAdmin
      .from('products').select('price_min').eq('store_id', storeId).eq('user_id', userId);
    const avgPriceMin = avgData && avgData.length > 0
      ? avgData.reduce((acc: number, p: any) => acc + (p.price_min || 0), 0) / avgData.length
      : null;

    await supabaseAdmin.from('store_metrics_history').insert({
      user_id: userId,
      store_id: storeId,
      total_products: totalProducts,
      price_changes: totalPriceChanges,
      avg_price_min: avgPriceMin,
    });

    await supabaseAdmin.from('scrape_run_stores').update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      page_count: pageCount,
      product_count: totalProducts,
      price_changes: totalPriceChanges,
      message: `${totalProducts} products, ${totalPriceChanges} price changes`,
    }).eq('id', runStoreId);

    const { data: runData } = await supabaseAdmin
      .from('scrape_runs')
      .select('total_products, total_price_changes, completed_stores')
      .eq('id', scrapeRunId)
      .single();
    if (runData) {
      await supabaseAdmin.from('scrape_runs').update({
        total_products: (runData.total_products || 0) + totalProducts,
        total_price_changes: (runData.total_price_changes || 0) + totalPriceChanges,
        completed_stores: (runData.completed_stores || 0) + 1,
      }).eq('id', scrapeRunId);
    }

    await log('info', `Completed ${store.name}: ${totalProducts} products, ${totalPriceChanges} price changes`);

    return new Response(JSON.stringify({
      success: true, totalProducts, totalPriceChanges, pageCount,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    await log('error', `Fatal error scraping ${store.name}: ${String(err)}`);
    await supabaseAdmin.from('scrape_run_stores').update({
      status: 'error',
      finished_at: new Date().toISOString(),
      page_count: pageCount,
      product_count: totalProducts,
      price_changes: totalPriceChanges,
      message: String(err),
    }).eq('id', runStoreId);

    const { data: runData } = await supabaseAdmin.from('scrape_runs').select('error_count, completed_stores').eq('id', scrapeRunId).single();
    if (runData) {
      await supabaseAdmin.from('scrape_runs').update({
        error_count: (runData.error_count || 0) + 1,
        completed_stores: (runData.completed_stores || 0) + 1,
      }).eq('id', scrapeRunId);
    }

    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
