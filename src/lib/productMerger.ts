// Field merging for two-phase product data.
// Rule: never overwrite a populated field with an empty one.
// Exceptions for price, image, and description are handled explicitly.

export interface MergeableProduct {
  title?: string | null;
  brand?: string | null;
  category?: string | null;
  category_path?: string[];
  description_html?: string | null;
  description_plain?: string | null;
  price?: number | null;
  was_price?: number | null;
  price_text?: string | null;
  image_url?: string | null;
  image_urls?: string[];
  in_stock?: boolean | null;
  availability_text?: string | null;
  size_text?: string | null;
  tags?: string[];
  sku?: string | null;
  gtin?: string | null;
  external_id?: string | null;
  scrape_method?: string;
}

function isPopulated(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

/**
 * Merges listing-page (phase1) data with detail-page (phase2) data.
 * Phase 2 wins for most fields. Exceptions: never overwrite populated with empty.
 */
export function mergeProductData(
  phase1: MergeableProduct,
  phase2: MergeableProduct,
): MergeableProduct {
  const merged: MergeableProduct = { ...phase1 };

  // Standard string fields: phase2 wins if populated
  const stringFields: (keyof MergeableProduct)[] = [
    'title', 'brand', 'category', 'availability_text', 'size_text', 'sku', 'gtin',
    'external_id', 'scrape_method', 'price_text',
  ];
  for (const field of stringFields) {
    if (isPopulated(phase2[field])) {
      (merged as any)[field] = phase2[field];
    }
  }

  // Price: prefer phase2 if non-null (detail page is more authoritative)
  if (phase2.price != null && phase2.price > 0) {
    merged.price = phase2.price;
  }

  // was_price: prefer phase2 if present
  if (phase2.was_price != null && phase2.was_price > 0) {
    merged.was_price = phase2.was_price;
  }

  // image_url: prefer phase2 full image over listing thumbnail
  if (isPopulated(phase2.image_url)) {
    merged.image_url = phase2.image_url;
  }

  // description_html: prefer the longer of the two
  const d1 = phase1.description_html ?? '';
  const d2 = phase2.description_html ?? '';
  merged.description_html = d2.length >= d1.length ? (d2 || d1 || null) : d1;

  // description_plain: same logic
  const p1 = phase1.description_plain ?? '';
  const p2 = phase2.description_plain ?? '';
  merged.description_plain = p2.length >= p1.length ? (p2 || p1 || null) : p1;

  // image_urls: union of all, deduped
  const allImages = [
    ...(phase1.image_urls ?? []),
    ...(phase2.image_urls ?? []),
  ].filter(Boolean);
  merged.image_urls = [...new Set(allImages)];
  // Ensure image_url is the first valid image
  if (!isPopulated(merged.image_url) && merged.image_urls.length > 0) {
    merged.image_url = merged.image_urls[0];
  }

  // category_path: prefer phase2 (breadcrumbs come from detail page)
  if (phase2.category_path && phase2.category_path.length > 0) {
    merged.category_path = phase2.category_path;
    // Derive category from last breadcrumb if not set
    if (!isPopulated(merged.category)) {
      merged.category = phase2.category_path[phase2.category_path.length - 1] ?? null;
    }
  }

  // tags: union
  const allTags = [...(phase1.tags ?? []), ...(phase2.tags ?? [])];
  merged.tags = [...new Set(allTags)];

  // in_stock: prefer phase2
  if (phase2.in_stock !== null && phase2.in_stock !== undefined) {
    merged.in_stock = phase2.in_stock;
  }

  return merged;
}

/**
 * Normalise a product URL to absolute. Returns null if invalid.
 */
export function absoluteUrl(url: string | null | undefined, baseUrl: string): string | null {
  if (!url) return null;
  url = url.trim();
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return baseUrl.replace(/\/$/, '') + url;
  return null;
}

/**
 * Slugify a title into a URL handle.
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
