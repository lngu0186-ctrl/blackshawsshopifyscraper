// enrich-products: Phase 2 — Fetches detail pages for unenriched products.
// Extracts JSON-LD, meta tags, __NEXT_DATA__, and per-site selectors.
// Accepts: { source_key, limit?, job_id, product_id? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; AUPharmacyScout/1.0)',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
};

// ── JSON-LD extraction ──────────────────────────────────────────────────────
function extractAllJsonLd(html: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const regex = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) results.push(...parsed);
      else results.push(parsed);
    } catch { /* skip */ }
  }
  return results;
}

function extractJsonLdProduct(html: string): Record<string, unknown> | null {
  const blocks = extractAllJsonLd(html);
  const all: Record<string, unknown>[] = [];
  for (const b of blocks) {
    if (b['@graph'] && Array.isArray(b['@graph'])) all.push(...(b['@graph'] as Record<string, unknown>[]));
    all.push(b);
  }
  return all.find(b => String(b['@type'] ?? '').toLowerCase().includes('product')) ?? null;
}

function extractJsonLdBreadcrumbs(html: string): string[] {
  const blocks = extractAllJsonLd(html);
  const all: Record<string, unknown>[] = [];
  for (const b of blocks) {
    if (b['@graph'] && Array.isArray(b['@graph'])) all.push(...(b['@graph'] as Record<string, unknown>[]));
    all.push(b);
  }
  const bc = all.find(b => String(b['@type'] ?? '').toLowerCase().includes('breadcrumb'));
  if (!bc) return [];
  const list = bc['itemListElement'] as any[] | undefined;
  if (!Array.isArray(list)) return [];
  return list
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(i => i.name ?? i.item?.name ?? '')
    .filter(Boolean);
}

// ── Meta tag extraction ─────────────────────────────────────────────────────
function extractMeta(html: string, attr: string): string | null {
  const safe = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${safe}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${safe}["']`,
    'i',
  );
  const m = html.match(re);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

// ── __NEXT_DATA__ extraction ────────────────────────────────────────────────
function extractNextData(html: string): Record<string, unknown> | null {
  const m = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try { return JSON.parse(m[1].trim()); } catch { return null; }
}

function deepGet(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, k) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

// ── Price parsing ───────────────────────────────────────────────────────────
function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let c = '';
  for (const ch of String(raw)) {
    if ((ch >= '0' && ch <= '9') || ch === '.' || ch === ',') c += ch;
  }
  c = c.replace(/,(\d{2})$/, '.$1').replace(/,/g, '');
  const v = parseFloat(c);
  return isNaN(v) || v <= 0 ? null : v;
}

// ── Image helpers ───────────────────────────────────────────────────────────
function absoluteImg(src: string, baseUrl: string): string | null {
  if (!src) return null;
  src = src.trim().split('?')[0];
  if (src.startsWith('data:')) return null;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('/')) return baseUrl.replace(/\/$/, '') + src;
  return null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Confidence ──────────────────────────────────────────────────────────────
function calcScore(p: { title?: string | null; price?: number | null; image_url?: string | null; description_html?: string | null; source_url?: string | null; brand?: string | null; detail_scraped?: boolean }): number {
  let s = 0;
  if (p.title?.trim()) s += 20;
  if (p.price && p.price > 0) s += 25;
  if (p.image_url?.trim()) s += 15;
  if (p.description_html?.trim()) s += 15;
  if (p.source_url?.trim()) s += 10;
  if (p.brand?.trim()) s += 5;
  if (p.detail_scraped) s += 5;
  return s;
}

function getMissing(p: { title?: string | null; price?: number | null; image_url?: string | null; description_html?: string | null; brand?: string | null; category?: string | null }): string[] {
  const m: string[] = [];
  if (!p.title?.trim()) m.push('title');
  if (!p.price || p.price <= 0) m.push('price');
  if (!p.image_url?.trim()) m.push('image_url');
  if (!p.description_html?.trim()) m.push('description_html');
  if (!p.brand?.trim()) m.push('brand');
  if (!p.category?.trim()) m.push('category');
  return m;
}

// ── Core enrichment ─────────────────────────────────────────────────────────
async function enrichProduct(product: any, baseUrl: string): Promise<Partial<typeof product>> {
  const url = product.source_url;
  let html = '';

  // Fetch with retries
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: SCRAPE_HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
      break;
    } catch (e: any) {
      if (attempt === 2) {
        return {
          detail_scraped: false,
          detail_fetch_attempts: (product.detail_fetch_attempts ?? 0) + 1,
          detail_fetch_error: e.message,
        };
      }
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 2000));
    }
  }

  const updates: Record<string, unknown> = {};

  // ── JSON-LD Product ──
  const jsonLdProduct = extractJsonLdProduct(html);
  if (jsonLdProduct) {
    updates.raw_detail = jsonLdProduct;

    if (jsonLdProduct.name && !product.title) updates.title = String(jsonLdProduct.name);

    // Brand
    const brandNode = jsonLdProduct.brand as any;
    if (brandNode) {
      const brandName = typeof brandNode === 'string' ? brandNode : (brandNode.name ?? null);
      if (brandName) updates.brand = String(brandName);
    }

    // Description
    if (jsonLdProduct.description) {
      const desc = String(jsonLdProduct.description);
      if (desc.length > (product.description_html?.length ?? 0)) {
        updates.description_html = desc;
        updates.description_plain = stripHtml(desc);
      }
    }

    // SKU, GTIN
    if (jsonLdProduct.sku && !product.sku) updates.sku = String(jsonLdProduct.sku);
    const gtin = jsonLdProduct.gtin13 ?? jsonLdProduct.gtin8 ?? jsonLdProduct.gtin;
    if (gtin && !product.gtin) updates.gtin = String(gtin);

    // Image
    const imgNode = jsonLdProduct.image;
    if (imgNode) {
      const imgUrl = Array.isArray(imgNode) ? imgNode[0] : imgNode;
      const abs = absoluteImg(String(imgUrl), baseUrl);
      if (abs) updates.image_url = abs;
    }

    // Price
    const offers = jsonLdProduct.offers as any;
    if (offers) {
      const list = Array.isArray(offers) ? offers : [offers];
      let minPrice: number | null = null;
      let highPrice: number | null = null;
      for (const o of list) {
        const p = parsePrice(String(o.price ?? o.lowPrice ?? ''));
        const h = parsePrice(String(o.highPrice ?? ''));
        if (p !== null && (minPrice === null || p < minPrice)) minPrice = p;
        if (h !== null && (highPrice === null || h > highPrice)) highPrice = h;
      }
      if (minPrice !== null) updates.price = minPrice;
      if (highPrice !== null && minPrice !== null && highPrice > minPrice) {
        updates.was_price = highPrice;
      }
      if (updates.price === undefined && !product.price) {
        const firstPrice = parsePrice(String(list[0]?.price ?? ''));
        if (firstPrice) updates.price = firstPrice;
      }

      // Availability
      const avail = String(list[0]?.availability ?? '').toLowerCase();
      if (avail) {
        updates.in_stock = avail.includes('instock');
        updates.availability_text = avail.includes('instock') ? 'In Stock' : 'Out of Stock';
      }
    }
  }

  // ── Meta tags (fill gaps) ──
  if (!updates.price && !product.price) {
    const metaPrice = parsePrice(extractMeta(html, 'product:price:amount') ?? extractMeta(html, 'og:price:amount'));
    if (metaPrice) updates.price = metaPrice;
  }
  if (!updates.image_url && !product.image_url) {
    const metaImg = extractMeta(html, 'og:image') ?? extractMeta(html, 'twitter:image');
    if (metaImg) updates.image_url = absoluteImg(metaImg, baseUrl);
  }
  if (!updates.description_html && !product.description_html) {
    const metaDesc = extractMeta(html, 'og:description') ?? extractMeta(html, 'description');
    if (metaDesc) {
      updates.description_html = metaDesc;
      updates.description_plain = metaDesc;
    }
  }

  // ── __NEXT_DATA__ (fill gaps) ──
  if (!updates.price && !product.price) {
    const nextData = extractNextData(html);
    if (nextData) {
      const productData = deepGet(nextData as Record<string, unknown>, 'props.pageProps.product') as any;
      if (productData) {
        const np = parsePrice(String(productData.price ?? productData.variants?.[0]?.price ?? ''));
        if (np) updates.price = np;
        if (!updates.image_url && !product.image_url) {
          const nImg = productData.image?.src ?? productData.featured_image ?? null;
          if (nImg) updates.image_url = absoluteImg(String(nImg), baseUrl);
        }
      }
    }
  }

  // ── Breadcrumbs ──
  const breadcrumbs = extractJsonLdBreadcrumbs(html);
  if (breadcrumbs.length > 0) {
    updates.category_path = breadcrumbs;
    if (!updates.category && !(product.category)) {
      updates.category = breadcrumbs[breadcrumbs.length - 1];
    }
  }

  // ── Additional images from og:image or JSON-LD ──
  const imgUrls: string[] = [...(product.image_urls ?? [])];
  if (updates.image_url && !imgUrls.includes(updates.image_url as string)) {
    imgUrls.unshift(updates.image_url as string);
  }
  updates.image_urls = [...new Set(imgUrls)];
  if (!updates.image_url && imgUrls.length > 0) updates.image_url = imgUrls[0];

  // ── Merge and score ──
  const merged = {
    title: updates.title ?? product.title,
    price: updates.price ?? product.price,
    was_price: updates.was_price ?? product.was_price,
    image_url: updates.image_url ?? product.image_url,
    description_html: updates.description_html ?? product.description_html,
    brand: updates.brand ?? product.brand,
    category: updates.category ?? product.category,
    source_url: product.source_url,
    detail_scraped: true,
  };

  const score = calcScore(merged);
  const missing = getMissing(merged);

  return {
    ...updates,
    detail_scraped: true,
    detail_fetch_attempts: (product.detail_fetch_attempts ?? 0) + 1,
    detail_fetch_error: null,
    confidence_score: score,
    missing_fields: missing,
    scrape_status: score >= 90 ? 'enriched' : score >= 60 ? 'partial' : 'failed',
    enriched_at: new Date().toISOString(),
    scrape_method: updates.raw_detail ? 'json_ld' : (product.scrape_method ?? 'html'),
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────
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
    const { source_key, limit = 50, job_id, product_id } = body;

    // Fetch products to enrich
    let query = supabaseAdmin
      .from('scraped_products')
      .select('*')
      .eq('user_id', user.id)
      .eq('detail_scraped', false)
      .lt('detail_fetch_attempts', 3);

    if (product_id) {
      query = supabaseAdmin.from('scraped_products').select('*').eq('id', product_id).eq('user_id', user.id);
    } else if (source_key) {
      query = query.eq('source_key', source_key);
    }

    const { data: products, error: fetchError } = await (product_id ? query : query.limit(limit));
    if (fetchError) throw fetchError;
    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ success: true, enriched: 0, remaining: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine base URL
    const baseUrlMap: Record<string, string> = {
      mr_vitamins: 'https://www.mrvitamins.com.au',
      evelyn_faye: 'https://www.evelynfaye.com.au',
      gr8_health: 'https://gr8health.com.au',
      healthylife: 'https://www.healthylife.com.au',
      wombat_pharmacy: 'https://www.wombatpharmacy.com.au',
      david_jones_pharmacy: 'https://www.davidjonespharmacy.com.au',
      super_pharmacy_plus: 'https://superpharmacyplus.com.au',
    };

    let enriched = 0;
    let failed = 0;

    for (const product of products) {
      const baseUrl = baseUrlMap[product.source_key] ?? '';
      await new Promise(r => setTimeout(r, 500)); // 2 req/sec rate limit

      const updates = await enrichProduct(product, baseUrl);
      const { error: updateError } = await supabaseAdmin
        .from('scraped_products')
        .update(updates)
        .eq('id', product.id);

      if (!updateError) {
        if (updates.detail_scraped) enriched++;
        else failed++;
      }

      // Update job progress
      if (job_id) {
        await supabaseAdmin.from('scrape_jobs').update({
          total_enriched: enriched,
          total_failed: failed,
        }).eq('id', job_id);
      }
    }

    // Count remaining
    const { count: remaining } = await supabaseAdmin
      .from('scraped_products')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('detail_scraped', false)
      .lt('detail_fetch_attempts', 3)
      .eq('source_key', source_key ?? '');

    if (job_id && (remaining ?? 0) === 0) {
      await supabaseAdmin.from('scrape_jobs').update({ status: 'completed', finished_at: new Date().toISOString() }).eq('id', job_id);
    }

    return new Response(JSON.stringify({
      success: true,
      processed: products.length,
      enriched,
      failed,
      remaining: remaining ?? 0,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('enrich-products error:', e);
    return new Response(JSON.stringify({ error: e.message ?? 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
