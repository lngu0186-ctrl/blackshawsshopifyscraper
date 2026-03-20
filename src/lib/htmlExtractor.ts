// HTML extraction helpers: JSON-LD, __NEXT_DATA__, meta tags, breadcrumbs.
// All functions operate on plain HTML strings — no DOM APIs, safe for Edge Functions.

export interface JsonLdProduct {
  name?: string;
  description?: string;
  image?: string | string[];
  sku?: string;
  gtin13?: string;
  gtin8?: string;
  gtin?: string;
  brand?: { name?: string } | string;
  offers?: JsonLdOffer | JsonLdOffer[];
  aggregateRating?: unknown;
  [key: string]: unknown;
}

export interface JsonLdOffer {
  price?: string | number;
  priceCurrency?: string;
  lowPrice?: string | number;
  highPrice?: string | number;
  availability?: string;
  [key: string]: unknown;
}

export interface JsonLdBreadcrumb {
  name: string;
  item?: string;
}

/**
 * Parse all JSON-LD blocks from HTML. Returns array of parsed objects.
 */
export function extractAllJsonLd(html: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const regex = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) results.push(...parsed);
      else results.push(parsed);
    } catch {
      // ignore malformed blocks
    }
  }
  return results;
}

/**
 * Find the first JSON-LD block of @type = "Product".
 */
export function extractJsonLdProduct(html: string): JsonLdProduct | null {
  const blocks = extractAllJsonLd(html);
  // Check top-level @graph arrays
  const allObjects: Record<string, unknown>[] = [];
  for (const block of blocks) {
    if (block['@graph'] && Array.isArray(block['@graph'])) {
      allObjects.push(...(block['@graph'] as Record<string, unknown>[]));
    }
    allObjects.push(block);
  }
  const product = allObjects.find(
    b => String(b['@type'] ?? '').toLowerCase().includes('product'),
  );
  return (product as JsonLdProduct) ?? null;
}

/**
 * Extract BreadcrumbList from JSON-LD.
 */
export function extractJsonLdBreadcrumbs(html: string): string[] {
  const blocks = extractAllJsonLd(html);
  const allObjects: Record<string, unknown>[] = [];
  for (const block of blocks) {
    if (block['@graph'] && Array.isArray(block['@graph'])) {
      allObjects.push(...(block['@graph'] as Record<string, unknown>[]));
    }
    allObjects.push(block);
  }
  const breadcrumb = allObjects.find(
    b => String(b['@type'] ?? '').toLowerCase().includes('breadcrumb'),
  );
  if (!breadcrumb) return [];
  const list = breadcrumb['itemListElement'] as any[] | undefined;
  if (!Array.isArray(list)) return [];
  return list
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(item => item.name ?? item.item?.name ?? '')
    .filter(Boolean);
}

/**
 * Extract __NEXT_DATA__ from HTML. Returns parsed object or null.
 */
export function extractNextData(html: string): Record<string, unknown> | null {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

/**
 * Safely traverse a nested object by dot-notation path.
 */
export function deepGet(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/**
 * Extract meta tag content by property or name attribute.
 */
export function extractMetaTag(html: string, attribute: string): string | null {
  // Matches: <meta property="..." content="..."> or <meta name="..." content="...">
  const safeAttr = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${safeAttr}["'][^>]+content=["']([^"']+)["']` +
    `|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${safeAttr}["']`,
    'i',
  );
  const match = html.match(regex);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

/**
 * Extract all meta tags relevant to pricing and product.
 */
export interface MetaProductData {
  title: string | null;
  description: string | null;
  image: string | null;
  price: string | null;
  currency: string | null;
  availability: string | null;
  brand: string | null;
}

export function extractProductMetaTags(html: string): MetaProductData {
  return {
    title: extractMetaTag(html, 'og:title') ?? extractMetaTag(html, 'twitter:title'),
    description: extractMetaTag(html, 'og:description') ?? extractMetaTag(html, 'description'),
    image: extractMetaTag(html, 'og:image') ?? extractMetaTag(html, 'twitter:image'),
    price: extractMetaTag(html, 'product:price:amount') ?? extractMetaTag(html, 'og:price:amount'),
    currency: extractMetaTag(html, 'product:price:currency') ?? extractMetaTag(html, 'og:price:currency'),
    availability: extractMetaTag(html, 'product:availability') ?? extractMetaTag(html, 'og:availability'),
    brand: extractMetaTag(html, 'product:brand') ?? extractMetaTag(html, 'og:brand'),
  };
}

/**
 * Primitive HTML text extraction by CSS selector pattern (last resort).
 * Matches the FIRST element matching any of the given tag+class combos.
 * This is intentionally limited — prefer JSON-LD.
 */
export function extractTextBySelectorPatterns(html: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    // Convert simple selector to a heuristic regex: .classname or tag.classname or tag[attr]
    // Only supports simple class selectors like ".price-item--sale" or "h1.title"
    const classMatch = pattern.match(/(?:^|\s)\.([a-z0-9_-]+(?:\.[a-z0-9_-]+)*)$/i);
    if (classMatch) {
      const cls = classMatch[1].replace(/\./g, '[^"]*');
      const regex = new RegExp(
        `<[a-z]+[^>]+class="[^"]*${cls}[^"]*"[^>]*>([^<]+)`,
        'i',
      );
      const m = html.match(regex);
      if (m) return m[1].trim();
    }
  }
  return null;
}

/**
 * Strip HTML tags, normalise whitespace.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean description HTML: remove scripts, style, nav, header, footer.
 */
export function cleanDescriptionHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Make relative URLs absolute.
 */
export function absoluteImageUrl(src: string | null | undefined, baseUrl: string): string | null {
  if (!src) return null;
  src = src.trim().split('?')[0]; // strip query for cleaner URLs
  if (src.startsWith('data:')) return null;
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('/')) return baseUrl.replace(/\/$/, '') + src;
  return null;
}

/**
 * Extract all image src values from img tags matching src patterns.
 * Returns absolute URLs only.
 */
export function extractImageUrls(html: string, baseUrl: string): string[] {
  const imgs: string[] = [];
  const regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const abs = absoluteImageUrl(m[1], baseUrl);
    if (abs && !imgs.includes(abs)) imgs.push(abs);
  }
  return imgs;
}
