/**
 * detect-platforms — expanded to support Shopify, WooCommerce, BigCommerce,
 * OpenCart, Storbie, and Unknown. Saves platform, platform_confidence,
 * and a last_detected_at timestamp to each store record.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AUPharmacyScout/1.0)',
  'Accept': 'text/html,application/json,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
};

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 12000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, headers: SCRAPE_HEADERS, ...opts });
    clearTimeout(tid);
    return res;
  } catch {
    return null;
  }
}

interface DetectionResult {
  platform: string;
  confidence: string;
  evidence: string[];
}

async function detectPlatform(url: string): Promise<DetectionResult> {
  const evidence: string[] = [];

  // ── Test 1: Shopify /products.json (high confidence) ────────────────────
  const productsJson = await fetchWithTimeout(`${url}/products.json?limit=5`);
  if (productsJson && productsJson.ok) {
    try {
      const d = await productsJson.json();
      if (d && Array.isArray(d.products)) {
        evidence.push('products_json_responded');
        return { platform: 'shopify', confidence: 'high', evidence };
      }
    } catch { await productsJson.text().catch(() => {}); }
  }

  // ── Test 2: WooCommerce REST API (high confidence) ───────────────────────
  const wcApi = await fetchWithTimeout(`${url}/wp-json/wc/v3/products?per_page=1`);
  if (wcApi && wcApi.ok) {
    try {
      const d = await wcApi.json();
      if (Array.isArray(d)) {
        evidence.push('wc_rest_api_responded');
        return { platform: 'woocommerce', confidence: 'high', evidence };
      }
    } catch { await wcApi.text().catch(() => {}); }
  }

  // ── Test 3: BigCommerce storefront API ───────────────────────────────────
  const bcApi = await fetchWithTimeout(`${url}/api/storefront/products?limit=1`);
  if (bcApi && bcApi.ok) {
    try {
      const d = await bcApi.json();
      if (Array.isArray(d) || d?.data) {
        evidence.push('bigcommerce_api_responded');
        return { platform: 'bigcommerce', confidence: 'high', evidence };
      }
    } catch { await bcApi.text().catch(() => {}); }
  }

  // ── Test 4: HTML heuristics ──────────────────────────────────────────────
  const homepage = await fetchWithTimeout(url);
  if (homepage && homepage.ok) {
    const html = await homepage.text();

    // Shopify signals
    if (html.includes('cdn.shopify.com')) evidence.push('cdn_shopify_com');
    if (html.includes('Shopify.theme')) evidence.push('shopify_theme_js');
    if (/meta[^>]+generator[^>]+Shopify/i.test(html)) evidence.push('meta_generator_shopify');
    if (html.includes('shopify-section')) evidence.push('shopify_section_class');

    if (evidence.some(e => ['cdn_shopify_com','shopify_theme_js','meta_generator_shopify','shopify_section_class'].includes(e))) {
      // Weak verification via /collections.json
      const colJson = await fetchWithTimeout(`${url}/collections.json?limit=1`);
      if (colJson?.ok) {
        try {
          const d = await colJson.json();
          if (d && Array.isArray(d.collections)) evidence.push('collections_json_responded');
        } catch { await colJson.text().catch(() => {}); }
      }
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

    // BigCommerce HTML signals
    if (html.includes('cdn.bigcommerce.com') || html.includes('bigcommerce')) {
      evidence.push('bigcommerce_reference');
      return { platform: 'bigcommerce', confidence: 'medium', evidence };
    }

    // OpenCart signals
    if (html.includes('catalog/view/theme') || html.includes('route=common') || /meta[^>]+generator[^>]+OpenCart/i.test(html)) {
      evidence.push('opencart_reference');
      return { platform: 'opencart', confidence: 'medium', evidence };
    }

    // Storbie (AU/NZ pharmacy platform)
    if (/storbie\.com/i.test(html) || html.includes('storbie')) {
      evidence.push('storbie_reference');
      return { platform: 'storbie', confidence: 'medium', evidence };
    }
  }

  // ── Test 5: Weak Shopify via /collections.json ───────────────────────────
  const colJson = await fetchWithTimeout(`${url}/collections.json?limit=1`);
  if (colJson && colJson.ok) {
    try {
      const d = await colJson.json();
      if (d && Array.isArray(d.collections)) {
        evidence.push('collections_json_responded');
        return { platform: 'shopify', confidence: 'low', evidence };
      }
    } catch { await colJson.text().catch(() => {}); }
  }

  evidence.push('no_platform_signals_found');
  return { platform: 'unknown', confidence: 'none', evidence };
}

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

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const specificIds: string[] | undefined = body?.store_ids;

  let query = supabaseAdmin.from('stores')
    .select('id, name, normalized_url, platform')
    .eq('user_id', userId);

  if (specificIds && specificIds.length > 0) {
    query = query.in('id', specificIds);
  } else {
    query = query.or('platform.is.null,platform.eq.unknown');
  }

  const { data: stores, error: storesErr } = await query;
  if (storesErr || !stores) {
    return new Response(JSON.stringify({ error: storesErr?.message ?? 'Failed to load stores' }), { status: 500, headers: corsHeaders });
  }

  const results: Array<{ id: string; name: string; platform: string; confidence: string; evidence: string[] }> = [];

  for (const store of stores) {
    const url = store.normalized_url;
    if (!url) continue;

    try {
      const { platform, confidence, evidence } = await detectPlatform(url);
      await supabaseAdmin.from('stores').update({
        platform,
        platform_confidence: confidence,
        // Store evidence as qualification_notes JSON snippet
        qualification_notes: JSON.stringify({ platform_evidence: evidence, detected_at: new Date().toISOString() }),
      }).eq('id', store.id);
      results.push({ id: store.id, name: store.name, platform, confidence, evidence });
    } catch (err) {
      results.push({ id: store.id, name: store.name, platform: 'unknown', confidence: 'error', evidence: [String(err)] });
    }
  }

  return new Response(JSON.stringify({
    processed: results.length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
