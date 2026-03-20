/**
 * detect-platforms — Block 6
 * Runs platform detection on all stores where platform = 'unknown' or NULL
 * and persists the result to stores.platform + stores.platform_confidence.
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

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, headers: SCRAPE_HEADERS });
    clearTimeout(tid);
    return res;
  } catch {
    return null;
  }
}

async function detectPlatform(url: string): Promise<{ platform: string; confidence: string }> {
  // Test 1: /products.json (Shopify JSON API — high confidence)
  const productsJson = await fetchWithTimeout(`${url}/products.json?limit=5`);
  if (productsJson && productsJson.ok) {
    try {
      const d = await productsJson.json();
      if (d && Array.isArray(d.products)) {
        return { platform: 'shopify', confidence: 'high' };
      }
    } catch { /* not JSON */ }
  }

  // Test 2: WooCommerce REST API
  const wcApi = await fetchWithTimeout(`${url}/wp-json/wc/v3/products?per_page=1`);
  if (wcApi && wcApi.ok) {
    try {
      const d = await wcApi.json();
      if (Array.isArray(d)) {
        return { platform: 'woocommerce', confidence: 'high' };
      }
    } catch { /* not JSON */ }
  }

  // Test 3: Homepage HTML heuristics
  const homepage = await fetchWithTimeout(url);
  if (homepage && homepage.ok) {
    const html = await homepage.text();

    // Shopify signals
    if (
      html.includes('Shopify.theme') ||
      html.includes('cdn.shopify.com') ||
      html.includes('shopify-section') ||
      /meta[^>]+generator[^>]+Shopify/i.test(html)
    ) {
      return { platform: 'shopify', confidence: 'medium' };
    }

    // WooCommerce signals
    if (
      html.includes('/wp-content/') ||
      html.includes('woocommerce') ||
      html.includes('wc-block') ||
      /meta[^>]+generator[^>]+WooCommerce/i.test(html)
    ) {
      return { platform: 'woocommerce', confidence: 'medium' };
    }

    // Weak Shopify via /collections.json
    const colJson = await fetchWithTimeout(`${url}/collections.json?limit=1`);
    if (colJson && colJson.ok) {
      try {
        const d = await colJson.json();
        if (d && Array.isArray(d.collections)) {
          return { platform: 'shopify', confidence: 'low' };
        }
      } catch { /* not JSON */ }
    }
  }

  return { platform: 'unknown', confidence: 'none' };
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

  // Accept optional store_ids array to limit scope; default = all unknown stores
  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const specificIds: string[] | undefined = body?.store_ids;

  // Fetch stores needing detection
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

  const results: Array<{ id: string; name: string; platform: string; confidence: string }> = [];

  for (const store of stores) {
    const url = store.normalized_url;
    if (!url) continue;

    try {
      const { platform, confidence } = await detectPlatform(url);
      await supabaseAdmin.from('stores').update({
        platform,
        platform_confidence: confidence,
      }).eq('id', store.id);
      results.push({ id: store.id, name: store.name, platform, confidence });
    } catch (err) {
      results.push({ id: store.id, name: store.name, platform: 'unknown', confidence: 'error' });
    }
  }

  return new Response(JSON.stringify({
    processed: results.length,
    results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
