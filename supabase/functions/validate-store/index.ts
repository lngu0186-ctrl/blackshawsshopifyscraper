import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AUPharmacyScout/1.0)',
  'Accept': 'application/json, text/html;q=0.9',
  'Accept-Language': 'en-AU,en;q=0.9',
};

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 15000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { ...opts, signal: controller.signal, headers: { ...SCRAPE_HEADERS, ...(opts.headers || {}) } });
    clearTimeout(timeout);
    return res;
  } catch {
    return null;
  }
}

function isRedirectedToPassword(res: Response): boolean {
  const url = res.url || '';
  return url.includes('/password');
}

async function checkPasswordProtected(res: Response | null, baseUrl: string): Promise<{ isProtected: boolean; authType: 'storefront_password' | 'customer_account' | null }> {
  if (!res) return { isProtected: false, authType: null };

  // Check redirect to /password
  if (isRedirectedToPassword(res)) {
    return { isProtected: true, authType: 'storefront_password' };
  }

  // Check status 401
  if (res.status === 401) {
    return { isProtected: true, authType: 'storefront_password' };
  }

  // Check HTML body for password form or account login
  if (res.status === 200 || res.status === 403) {
    try {
      const text = await res.text();
      if (text.includes('action="/password"') || text.includes('form_type=storefront_password')) {
        return { isProtected: true, authType: 'storefront_password' };
      }
      if (text.includes('action="/account/login"') || text.includes('form_type=customer_login')) {
        return { isProtected: true, authType: 'customer_account' };
      }
    } catch { /* ignore */ }
  }

  return { isProtected: false, authType: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ valid: false, error: 'URL is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize URL
    let normalized = url.trim().toLowerCase();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    normalized = normalized.replace(/\/+$/, '');

    let myshopifyDomain: string | null = null;
    try {
      myshopifyDomain = new URL(normalized).hostname;
    } catch { /* ignore */ }

    // ── Tier 1: Standard products.json ────────────────────────────────────────
    const tier1Url = `${normalized}/products.json?limit=1`;
    const tier1 = await fetchWithTimeout(tier1Url);

    if (tier1 && tier1.ok) {
      try {
        const data = await tier1.json();
        if (data && Array.isArray(data.products)) {
          return new Response(JSON.stringify({
            valid: true,
            scrape_strategy: 'products_json',
            validation_status: 'valid',
            requires_auth: false,
            normalized_url: normalized,
            myshopify_domain: myshopifyDomain,
            product_count_sample: data.products.length,
            message: 'Valid Shopify store — standard products.json endpoint accessible.',
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } catch { /* fall through */ }
    }

    // Check tier 1 for auth redirect
    const tier1Auth = await checkPasswordProtected(tier1, normalized);
    if (tier1Auth.isProtected) {
      return new Response(JSON.stringify({
        valid: true,
        scrape_strategy: 'password_protected',
        validation_status: 'password_protected',
        requires_auth: true,
        auth_type: tier1Auth.authType,
        normalized_url: normalized,
        myshopify_domain: myshopifyDomain,
        message: tier1Auth.authType === 'customer_account'
          ? 'This store requires a customer account login to access products.'
          : 'This store requires a storefront password.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Tier 2: Collections fallback ─────────────────────────────────────────
    const collectionUrls = [
      `${normalized}/collections/all/products.json?limit=1`,
      `${normalized}/collections/frontpage/products.json?limit=1`,
    ];

    for (const collUrl of collectionUrls) {
      const res = await fetchWithTimeout(collUrl);
      if (res && res.ok) {
        try {
          const data = await res.json();
          if (data && Array.isArray(data.products)) {
            return new Response(JSON.stringify({
              valid: true,
              scrape_strategy: 'collections_json',
              validation_status: 'valid',
              requires_auth: false,
              normalized_url: normalized,
              myshopify_domain: myshopifyDomain,
              product_count_sample: data.products.length,
              message: 'Shopify store accessible via collections endpoint.',
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        } catch { /* fall through */ }
      }

      const collAuth = await checkPasswordProtected(res, normalized);
      if (collAuth.isProtected) {
        return new Response(JSON.stringify({
          valid: true,
          scrape_strategy: 'password_protected',
          validation_status: 'password_protected',
          requires_auth: true,
          auth_type: collAuth.authType,
          normalized_url: normalized,
          myshopify_domain: myshopifyDomain,
          message: collAuth.authType === 'customer_account'
            ? 'This store requires a customer account login to access products.'
            : 'This store requires a storefront password.',
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ── Tier 3: Sitemap handle enumeration ────────────────────────────────────
    const sitemapRes = await fetchWithTimeout(`${normalized}/sitemap.xml`, { headers: { ...SCRAPE_HEADERS, Accept: 'text/xml,application/xml;q=0.9' } });
    if (sitemapRes && sitemapRes.ok) {
      try {
        const sitemapText = await sitemapRes.text();
        if (sitemapText.includes('/products/')) {
          // Count handles in sitemap
          const handleMatches = sitemapText.match(/\/products\/([a-z0-9\-]+)/g) || [];
          const uniqueHandles = new Set(handleMatches.map(m => m.replace('/products/', '')));
          return new Response(JSON.stringify({
            valid: true,
            scrape_strategy: 'sitemap_handles',
            validation_status: 'restricted',
            requires_auth: false,
            normalized_url: normalized,
            myshopify_domain: myshopifyDomain,
            product_count_sample: uniqueHandles.size,
            message: `Shopify store detected but JSON endpoints are blocked. Found ${uniqueHandles.size} product handles in sitemap — will scrape individually (slower).`,
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } catch { /* fall through */ }
    }

    // ── Tier 4: Password/account check via homepage ───────────────────────────
    const homepageRes = await fetchWithTimeout(`${normalized}/`);
    const homeAuth = await checkPasswordProtected(homepageRes, normalized);
    if (homeAuth.isProtected) {
      return new Response(JSON.stringify({
        valid: true,
        scrape_strategy: 'password_protected',
        validation_status: 'password_protected',
        requires_auth: true,
        auth_type: homeAuth.authType,
        normalized_url: normalized,
        myshopify_domain: myshopifyDomain,
        message: homeAuth.authType === 'customer_account'
          ? 'This store requires a customer account login to access products.'
          : 'This store is password protected. Enter credentials to enable scraping.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Tier 4b: Account login check ──────────────────────────────────────────
    const loginRes = await fetchWithTimeout(`${normalized}/account/login`);
    if (loginRes && loginRes.status === 200) {
      try {
        const loginHtml = await loginRes.text();
        if (loginHtml.includes('action="/account/login"') || loginHtml.includes('form_type=customer_login')) {
          return new Response(JSON.stringify({
            valid: true,
            scrape_strategy: 'password_protected',
            validation_status: 'password_protected',
            requires_auth: true,
            auth_type: 'customer_account',
            normalized_url: normalized,
            myshopify_domain: myshopifyDomain,
            message: 'This store requires a customer account login to access products.',
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } catch { /* fall through */ }
    }

    // ── Tier 5: Not Shopify ───────────────────────────────────────────────────
    return new Response(JSON.stringify({
      valid: false,
      scrape_strategy: 'invalid',
      validation_status: 'invalid',
      requires_auth: false,
      normalized_url: normalized,
      myshopify_domain: myshopifyDomain,
      message: 'This URL does not appear to be a Shopify store or does not expose any accessible product endpoints.',
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ valid: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
