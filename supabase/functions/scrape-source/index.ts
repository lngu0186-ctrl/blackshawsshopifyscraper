// scrape-source: Phase 1 — Discovers products from a source site and writes
// raw records to scraped_products with detail_scraped = false.
// Accepts: { source_key, job_id }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AUPharmacyScout/1.0)',
  'Accept': 'application/json, text/html;q=0.9',
  'Accept-Language': 'en-AU,en;q=0.9',
};

interface SiteAdapterConfig {
  platform: string;
  baseUrl: string;
  sourceName: string;
}

const SITE_ADAPTERS: Record<string, SiteAdapterConfig> = {
  mr_vitamins: { platform: 'shopify', baseUrl: 'https://www.mrvitamins.com.au', sourceName: 'Mr Vitamins' },
  evelyn_faye: { platform: 'shopify', baseUrl: 'https://www.evelynfaye.com.au', sourceName: 'Evelyn Faye Nutrition' },
  gr8_health:  { platform: 'shopify', baseUrl: 'https://gr8health.com.au', sourceName: 'Gr8 Health' },
  healthylife: { platform: 'shopify', baseUrl: 'https://www.healthylife.com.au', sourceName: 'Healthylife' },
  wombat_pharmacy:      { platform: 'shopify', baseUrl: 'https://www.wombatpharmacy.com.au', sourceName: 'Wombat Pharmacy' },
  david_jones_pharmacy: { platform: 'woocommerce', baseUrl: 'https://www.davidjonespharmacy.com.au', sourceName: 'David Jones Pharmacy' },
  super_pharmacy_plus:  { platform: 'woocommerce', baseUrl: 'https://superpharmacyplus.com.au', sourceName: 'Super Pharmacy Plus' },
};

// ---------------------------------------------------------------------------
// Shopify Phase 1 — paginate /products.json
// ---------------------------------------------------------------------------
async function scrapeShopify(baseUrl: string): Promise<any[]> {
  const products: any[] = [];
  let page = 1;
  let cursor: string | null = null;

  while (true) {
    const url = cursor
      ? `${baseUrl}/products.json?limit=250&page_info=${cursor}`
      : `${baseUrl}/products.json?limit=250&page=${page}`;

    const res = await fetch(url, { headers: SCRAPE_HEADERS });
    if (!res.ok) break;

    const json = await res.json();
    const batch: any[] = json.products ?? [];
    if (batch.length === 0) break;
    products.push(...batch);

    // Detect Link header cursor pagination
    const linkHeader = res.headers.get('link') ?? '';
    const nextMatch = linkHeader.match(/<[^>]+page_info=([^>&"]+)[^>]*>;\s*rel="next"/);
    if (nextMatch) {
      cursor = nextMatch[1];
    } else if (batch.length < 250) {
      break;
    } else {
      page++;
      cursor = null;
    }

    if (products.length > 5000) break; // safety cap
  }

  return products;
}

// ---------------------------------------------------------------------------
// WooCommerce Phase 1 — paginate /wp-json/wc/v3/products
// ---------------------------------------------------------------------------
async function scrapeWooCommerce(baseUrl: string): Promise<any[]> {
  const products: any[] = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`;
    const res = await fetch(url, { headers: SCRAPE_HEADERS });
    if (!res.ok) break;

    const batch: any[] = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    products.push(...batch);

    if (batch.length < 100) break;
    page++;
    if (products.length > 5000) break;
  }

  return products;
}

// ---------------------------------------------------------------------------
// Normalise raw Shopify product → ScrapedProduct shape
// ---------------------------------------------------------------------------
function normaliseShopify(raw: any, sourceKey: string, sourceName: string, baseUrl: string, userId: string) {
  const variant = raw.variants?.[0] ?? {};
  const price = variant.price ? parseFloat(variant.price) : null;
  const compareAtPrice = variant.compare_at_price ? parseFloat(variant.compare_at_price) : null;

  const images: string[] = (raw.images ?? [])
    .map((img: any) => img.src as string)
    .filter(Boolean);

  const tags = typeof raw.tags === 'string'
    ? raw.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : (Array.isArray(raw.tags) ? raw.tags : []);

  // Calculate confidence after Phase 1
  const score = calculateSimpleConfidence({
    title: raw.title, price, image_url: images[0] ?? null,
    description_html: raw.body_html, source_url: `${baseUrl}/products/${raw.handle}`,
    brand: raw.vendor, detail_scraped: false,
  });

  return {
    user_id: userId,
    source_key: sourceKey,
    source_name: sourceName,
    source_url: `${baseUrl}/products/${raw.handle}`,
    external_id: String(raw.id ?? ''),
    title: raw.title ?? 'Unknown',
    brand: raw.vendor ?? null,
    category: raw.product_type ?? null,
    category_path: raw.product_type ? [raw.product_type] : [],
    description_html: raw.body_html ?? null,
    description_plain: stripHtml(raw.body_html ?? ''),
    price: price,
    was_price: compareAtPrice && compareAtPrice > (price ?? 0) ? compareAtPrice : null,
    currency: 'AUD',
    price_text: variant.price ?? null,
    image_url: images[0] ?? null,
    image_urls: images,
    in_stock: variant.available ?? null,
    availability_text: variant.available ? 'In Stock' : 'Out of Stock',
    tags: [...tags, sourceKey, 'au-pharmacy-scout'],
    scrape_method: 'shopify_json',
    listing_scraped: true,
    detail_scraped: score >= 90,
    confidence_score: score,
    missing_fields: getMissingFields({ title: raw.title, price, image_url: images[0] ?? null, description_html: raw.body_html }),
    scrape_status: score >= 90 ? 'enriched' : 'partial',
    raw_listing: raw,
    scraped_at: new Date().toISOString(),
    enriched_at: score >= 90 ? new Date().toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Normalise raw WooCommerce product → ScrapedProduct shape
// ---------------------------------------------------------------------------
function normaliseWooCommerce(raw: any, sourceKey: string, sourceName: string, baseUrl: string, userId: string) {
  const price = raw.price ? parseFloat(raw.price) : null;
  const regularPrice = raw.regular_price ? parseFloat(raw.regular_price) : null;
  const salePrice = raw.sale_price ? parseFloat(raw.sale_price) : null;
  const actualPrice = salePrice ?? price;
  const wasPrice = salePrice && regularPrice && regularPrice > salePrice ? regularPrice : null;

  const images: string[] = (raw.images ?? [])
    .map((img: any) => img.src as string)
    .filter(Boolean);

  const tags: string[] = [
    ...(raw.tags ?? []).map((t: any) => t.name),
    sourceKey, 'au-pharmacy-scout',
  ];

  const category = raw.categories?.[0]?.name ?? null;
  const categoryPath = (raw.categories ?? []).map((c: any) => c.name);

  const score = calculateSimpleConfidence({
    title: raw.name, price: actualPrice, image_url: images[0] ?? null,
    description_html: raw.short_description || raw.description,
    source_url: raw.permalink ?? `${baseUrl}/product/${raw.slug}`,
    brand: null, detail_scraped: false,
  });

  return {
    user_id: userId,
    source_key: sourceKey,
    source_name: sourceName,
    source_url: raw.permalink ?? `${baseUrl}/product/${raw.slug}`,
    external_id: String(raw.id ?? ''),
    sku: raw.sku ?? null,
    gtin: raw.global_unique_id ?? null,
    title: raw.name ?? 'Unknown',
    brand: null,
    category,
    category_path: categoryPath,
    description_html: raw.short_description || raw.description || null,
    description_plain: stripHtml(raw.short_description || raw.description || ''),
    price: actualPrice,
    was_price: wasPrice,
    currency: 'AUD',
    price_text: raw.price ?? null,
    image_url: images[0] ?? null,
    image_urls: images,
    in_stock: raw.stock_status === 'instock',
    availability_text: raw.stock_status === 'instock' ? 'In Stock' : 'Out of Stock',
    tags,
    scrape_method: 'woo_api',
    listing_scraped: true,
    detail_scraped: score >= 90,
    confidence_score: score,
    missing_fields: getMissingFields({ title: raw.name, price: actualPrice, image_url: images[0] ?? null, description_html: raw.short_description || raw.description }),
    scrape_status: score >= 90 ? 'enriched' : 'partial',
    raw_listing: raw,
    scraped_at: new Date().toISOString(),
    enriched_at: score >= 90 ? new Date().toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Simple confidence scoring (mirrors src/lib/confidenceScorer.ts)
// ---------------------------------------------------------------------------
function calculateSimpleConfidence(p: {
  title?: string | null; price?: number | null; image_url?: string | null;
  description_html?: string | null; source_url?: string | null;
  brand?: string | null; detail_scraped?: boolean;
}): number {
  const weights = { title: 20, price: 25, image_url: 15, description_html: 15, source_url: 10, brand: 5, detail_scraped: 5 };
  let score = 0;
  if (p.title?.trim()) score += weights.title;
  if (p.price && p.price > 0) score += weights.price;
  if (p.image_url?.trim()) score += weights.image_url;
  if (p.description_html?.trim()) score += weights.description_html;
  if (p.source_url?.trim()) score += weights.source_url;
  if (p.brand?.trim()) score += weights.brand;
  if (p.detail_scraped) score += weights.detail_scraped;
  return score;
}

function getMissingFields(p: { title?: string | null; price?: number | null; image_url?: string | null; description_html?: string | null }): string[] {
  const missing: string[] = [];
  if (!p.title?.trim()) missing.push('title');
  if (!p.price || p.price <= 0) missing.push('price');
  if (!p.image_url?.trim()) missing.push('image_url');
  if (!p.description_html?.trim()) missing.push('description_html');
  return missing;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { source_key, job_id } = body;

    if (!source_key || !SITE_ADAPTERS[source_key]) {
      return new Response(JSON.stringify({ error: `Unknown source_key: ${source_key}` }), { status: 400, headers: corsHeaders });
    }

    const adapter = SITE_ADAPTERS[source_key];

    // Update job status to running
    if (job_id) {
      await supabaseAdmin.from('scrape_jobs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', job_id);
    }

    let rawProducts: any[] = [];
    try {
      if (adapter.platform === 'shopify') {
        rawProducts = await scrapeShopify(adapter.baseUrl);
      } else if (adapter.platform === 'woocommerce') {
        rawProducts = await scrapeWooCommerce(adapter.baseUrl);
      }
    } catch (e: any) {
      if (job_id) {
        await supabaseAdmin.from('scrape_jobs').update({ status: 'failed', finished_at: new Date().toISOString(), error: e.message }).eq('id', job_id);
      }
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }

    // Normalise
    const normalised = rawProducts.map(raw =>
      adapter.platform === 'shopify'
        ? normaliseShopify(raw, source_key, adapter.sourceName, adapter.baseUrl, userId)
        : normaliseWooCommerce(raw, source_key, adapter.sourceName, adapter.baseUrl, userId),
    );

    // Upsert in batches of 100
    let upserted = 0;
    for (let i = 0; i < normalised.length; i += 100) {
      const batch = normalised.slice(i, i + 100);
      const { error } = await supabaseAdmin
        .from('scraped_products')
        .upsert(batch, { onConflict: 'user_id,source_key,source_url', ignoreDuplicates: false });
      if (!error) upserted += batch.length;
    }

    const toEnrich = normalised.filter(p => !p.detail_scraped).length;

    if (job_id) {
      await supabaseAdmin.from('scrape_jobs').update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        total_discovered: upserted,
        total_enriched: upserted - toEnrich,
      }).eq('id', job_id);
    }

    return new Response(JSON.stringify({
      success: true,
      discovered: rawProducts.length,
      upserted,
      needs_enrichment: toEnrich,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('scrape-source error:', e);
    return new Response(JSON.stringify({ error: e.message ?? 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
