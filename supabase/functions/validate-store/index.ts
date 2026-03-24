/**
 * validate-store edge function — enhanced with full source qualification.
 * Block 5: Platform detection, scrapeability score, qualification card data.
 * Block 9: AU pharmacy intelligence, store_type classification, anti-bot detection.
 */
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

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 12000): Promise<Response | null> {
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

function detectAntiBot(html: string, headers: Headers): boolean {
  if (headers.get('cf-ray')) return true;
  if (html.includes('Checking your browser') || html.includes('cf-browser-verification')) return true;
  if (html.includes('__ddg1') || html.includes('DDoS-GUARD')) return true;
  if (html.includes('Distil Networks') || html.includes('DataDome')) return true;
  if (html.includes('Access Denied') && html.includes('Bot')) return true;
  return false;
}

function detectLoginRequired(html: string, url: string): boolean {
  if (url.includes('/login') || url.includes('/account/login') || url.includes('/signin')) return true;
  if (html.includes('You must be logged in') || html.includes('Please log in')) return true;
  if (html.includes('action="/account/login"') || html.includes('form_type=customer_login')) return true;
  if (html.includes('action="/password"') || html.includes('form_type=storefront_password')) return true;
  return false;
}

function classifyStoreType(domain: string, title: string, description: string, categories: string[]): string {
  const text = [domain, title, description, ...categories].join(' ').toLowerCase();
  if (/chemist|pharmacy|pharmacist|dispensary/.test(text)) return 'pharmacy';
  if (/chemist warehouse|priceline|terry white|amcal|discount drug/.test(text)) return 'chemist';
  if (/vitamin|supplement|protein|nootropic|collagen|omega/.test(text)) return 'vitamins_supplements';
  if (/wellness|apothecary|naturo|holistic|herbal/.test(text)) return 'wellness_apothecary';
  if (/health|medical|beauty|skincare/.test(text)) return 'general_health';
  return 'unknown';
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
    let domain = '';
    let wasCollectionScopedUrl = false;
    try {
      const parsed = new URL(normalized);
      domain = parsed.hostname;
      // Important: always normalize stores to the site origin, not a single collection URL.
      // This prevents under-scraping sites that were added using /collections/... URLs.
      wasCollectionScopedUrl = parsed.pathname.startsWith('/collections/');
      normalized = `${parsed.protocol}//${parsed.host}`;
    } catch { /* ignore */ }

    // ── Qualification state ────────────────────────────────────────────────────
    let reachable = false;
    let platform = 'unknown';
    let platformConfidence = 'none';
    let scrapeStrategy = 'unknown';
    let validationStatus = 'invalid';
    let requiresAuth = false;
    let authType: string | null = null;
    let sitemapFound = false;
    let sitemapUrl: string | null = null;
    let sampleCollections: string[] = [];
    let sampleProductUrl: string | null = null;
    let paginationDetected = false;
    let antibotSuspected = false;
    let loginRequired = false;
    const qualificationNotes: string[] = [];
    let pageTitle = '';
    let metaDescription = '';
    let sitemapProductCount = 0;
    if (wasCollectionScopedUrl) {
      qualificationNotes.push('Collection-scoped URL normalized to site root for full-store scraping');
      score += 5;
    }

    // Score components
    let score = 0;

    // ── Fetch homepage ─────────────────────────────────────────────────────────
    const homepageRes = await fetchWithTimeout(`${normalized}/`);
    let homepageHtml = '';
    if (homepageRes) {
      reachable = homepageRes.status < 500;
      try {
        homepageHtml = await homepageRes.text();
      } catch { /* ignore */ }

      if (reachable) score += 20;
      antibotSuspected = detectAntiBot(homepageHtml, homepageRes.headers);
      loginRequired = detectLoginRequired(homepageHtml, homepageRes.url || normalized);

      // Extract title and meta description
      const titleMatch = homepageHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) pageTitle = titleMatch[1].trim();
      const metaMatch = homepageHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i);
      if (metaMatch) metaDescription = metaMatch[1].trim();

      if (antibotSuspected) qualificationNotes.push('Anti-bot protection detected (Cloudflare/DataDome pattern)');
      else score += 5;
      if (loginRequired) {
        requiresAuth = true;
        qualificationNotes.push('Login or storefront password required');
      } else score += 5;
    } else {
      qualificationNotes.push('Site unreachable or timed out');
    }

    // ── Shopify detection: products.json ──────────────────────────────────────
    const productsJsonRes = await fetchWithTimeout(`${normalized}/products.json?limit=5`);
    if (productsJsonRes && productsJsonRes.ok) {
      try {
        const data = await productsJsonRes.json();
        if (data && Array.isArray(data.products) && data.products.length > 0) {
          platform = 'shopify';
          platformConfidence = 'high';
          scrapeStrategy = 'products_json';
          validationStatus = 'valid';
          score += 20; // platform detected
          score += 20; // product pages accessible

          const sample = data.products[0];
          if (sample?.handle) sampleProductUrl = `${normalized}/products/${sample.handle}`;
          if (data.products.length >= 5) paginationDetected = true;

          qualificationNotes.push(`Shopify — products.json endpoint accessible (${data.products.length} sample products)`);
        }
      } catch { /* not JSON */ }
    }

    // ── Shopify meta tag fallback ──────────────────────────────────────────────
    if (platform === 'unknown' && homepageHtml.includes('Shopify')) {
      platform = 'shopify';
      platformConfidence = 'medium';
      qualificationNotes.push('Shopify meta tag detected in page HTML');
    }

    // ── WooCommerce detection ─────────────────────────────────────────────────
    if (platform === 'unknown') {
      const wooApiRes = await fetchWithTimeout(`${normalized}/wp-json/wc/v3/products?per_page=1`);
      if (wooApiRes && (wooApiRes.ok || wooApiRes.status === 401)) {
        platform = 'woocommerce';
        platformConfidence = wooApiRes.ok ? 'high' : 'medium';
        scrapeStrategy = 'wc_api';
        validationStatus = 'valid';
        score += 20;
        qualificationNotes.push('WooCommerce REST API detected');
      } else if (homepageHtml.includes('wc-block') || homepageHtml.includes('woocommerce') || homepageHtml.includes('WooCommerce')) {
        platform = 'woocommerce';
        platformConfidence = 'low';
        qualificationNotes.push('WooCommerce markup detected in page HTML');
      }
    }

    if (platform !== 'unknown') score += 20;

    // ── Sitemap detection ─────────────────────────────────────────────────────
    const sitemapRes = await fetchWithTimeout(`${normalized}/sitemap.xml`, { headers: { ...SCRAPE_HEADERS, Accept: 'text/xml,application/xml;q=0.9' } });
    if (sitemapRes && sitemapRes.ok) {
      try {
        const sitemapText = await sitemapRes.text();
        if (sitemapText.includes('/products/') || sitemapText.includes('<loc>')) {
          sitemapFound = true;
          sitemapUrl = `${normalized}/sitemap.xml`;
          score += 10;
          const handles = sitemapText.match(/\/products\/([a-z0-9\-]+)/g) || [];
          sitemapProductCount = new Set(handles).size;
          qualificationNotes.push(`Sitemap found with ${sitemapProductCount} product handles`);

          if (platform === 'unknown' && sitemapProductCount > 0) {
            platform = 'shopify';
            platformConfidence = 'low';
            scrapeStrategy = 'sitemap_handles';
            validationStatus = 'restricted';
            score += 10;
            qualificationNotes.push('Shopify inferred from sitemap product URLs (JSON endpoints blocked)');
          }
        }
      } catch { /* ignore */ }
    }

    // ── Collections/categories detection ──────────────────────────────────────
    // Prefer real collection discovery over a few hardcoded guesses.
    const collectionsJsonRes = await fetchWithTimeout(`${normalized}/collections.json?limit=20`);
    if (collectionsJsonRes && collectionsJsonRes.ok) {
      try {
        const d = await collectionsJsonRes.json();
        if (d && Array.isArray(d.collections) && d.collections.length > 0) {
          sampleCollections = d.collections
            .map((c: any) => c?.handle)
            .filter(Boolean)
            .slice(0, 5)
            .map((handle: string) => `/collections/${handle}`);
          score += 20;
          qualificationNotes.push(`collections.json accessible — ${d.collections.length} collections discovered`);
        }
      } catch { /* ignore */ }
    }

    if (sampleCollections.length === 0) {
      const collectionTestUrls = [
        `${normalized}/collections/all/products.json?limit=3`,
        `${normalized}/collections/vitamins/products.json?limit=3`,
        `${normalized}/collections/supplements/products.json?limit=3`,
      ];
      for (const cUrl of collectionTestUrls) {
        const cRes = await fetchWithTimeout(cUrl);
        if (cRes && cRes.ok) {
          try {
            const d = await cRes.json();
            if (d && Array.isArray(d.products)) {
              sampleCollections.push(cUrl.replace(normalized, '').replace('/products.json?limit=3', ''));
              score += 20;
              qualificationNotes.push(`Collection endpoint accessible: ${cUrl.replace(normalized, '')}`);
              if (!sampleProductUrl && d.products[0]?.handle) {
                sampleProductUrl = `${normalized}/products/${d.products[0].handle}`;
              }
              break;
            }
          } catch { /* ignore */ }
        }
      }
    }

    // ── AU pharmacy category detection (Block 9) ──────────────────────────────
    const pharmacySignals = [
      '/collections/vitamins', '/collections/supplements', '/collections/health',
      '/collections/pharmacy', '/shop/', '/category/vitamins', '/category/supplements'
    ];
    const hasPharmacyPath = pharmacySignals.some(p => homepageHtml.toLowerCase().includes(p));
    const hasProductJsonLd = homepageHtml.includes('"@type": "Product"') || homepageHtml.includes('"@type":"Product"');
    if (hasPharmacyPath || hasProductJsonLd) {
      qualificationNotes.push('AU pharmacy/health category patterns detected in page');
    }

    // ── Auth check if not already detected ────────────────────────────────────
    if (!requiresAuth && platform === 'shopify') {
      const accountLoginRes = await fetchWithTimeout(`${normalized}/account/login`);
      if (accountLoginRes && accountLoginRes.status === 200) {
        try {
          const loginHtml = await accountLoginRes.text();
          if (loginHtml.includes('form_type=customer_login')) {
            requiresAuth = true;
            authType = 'customer_account';
            validationStatus = 'password_protected';
            qualificationNotes.push('Customer account login detected');
          }
        } catch { /* ignore */ }
      }
    }

    // ── Final scrapeability score cap ──────────────────────────────────────────
    score = Math.min(100, Math.max(0, score));

    // ── Recommended action ─────────────────────────────────────────────────────
    let recommendedAction: string;
    if (score >= 80) recommendedAction = 'supported';
    else if (score >= 60) recommendedAction = 'supported_caution';
    else if (score >= 40) recommendedAction = 'limited_support';
    else recommendedAction = 'not_recommended';

    // ── Store type classification ──────────────────────────────────────────────
    const storeType = classifyStoreType(domain, pageTitle, metaDescription, sampleCollections);

    // ── Reachability status ────────────────────────────────────────────────────
    let reachabilityStatus = 'unreachable';
    if (!homepageRes) reachabilityStatus = 'timeout';
    else if (reachable) reachabilityStatus = 'reachable';

    // ── Final validation status ────────────────────────────────────────────────
    if (requiresAuth) {
      validationStatus = 'password_protected';
      // Keep the underlying scrape strategy/platform truthy rather than overwriting it
      // with a non-executable pseudo-strategy. Auth gating is a validation state.
    } else if (platform === 'unknown' || score < 20) {
      validationStatus = 'invalid';
    }

    // ── Auth type from storefront password check ───────────────────────────────
    if (homepageHtml.includes('action="/password"') || homepageHtml.includes('form_type=storefront_password')) {
      requiresAuth = true;
      authType = 'storefront_password';
      validationStatus = 'password_protected';
    }

    const valid = platform !== 'unknown' || score >= 20;

    return new Response(JSON.stringify({
      valid,
      scrape_strategy: scrapeStrategy,
      validation_status: validationStatus,
      requires_auth: requiresAuth,
      auth_type: authType,
      normalized_url: normalized,
      myshopify_domain: domain,
      // Qualification card data
      platform,
      platform_confidence: platformConfidence,
      scrapeability_score: score,
      recommended_action: recommendedAction,
      reachability_status: reachabilityStatus,
      sitemap_found: sitemapFound,
      sitemap_url: sitemapUrl,
      sample_collections: sampleCollections,
      sample_product_url: sampleProductUrl,
      pagination_detected: paginationDetected,
      login_required: loginRequired || requiresAuth,
      antibot_suspected: antibotSuspected,
      store_type: storeType,
      qualification_notes: qualificationNotes,
      page_title: pageTitle,
      message: requiresAuth
        ? (authType === 'customer_account'
            ? 'This store requires a customer account login to access products.'
            : 'This store requires a storefront password.')
        : valid
          ? `${platform === 'shopify' ? 'Shopify' : platform === 'woocommerce' ? 'WooCommerce' : 'Store'} detected — scrapeability score ${score}/100`
          : 'Could not verify this store as a scrapeable Shopify or WooCommerce source.',
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ valid: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
