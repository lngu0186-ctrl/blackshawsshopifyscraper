// Source of Truth — CSV header constants
// Never use legacy Shopify aliases. Reference only these constants.

export const SHOPIFY_CSV_HEADERS = [
  "Title",
  "URL handle",
  "Description",
  "Vendor",
  "Product category",
  "Type",
  "Tags",
  "Published on online store",
  "Status",
  "SKU",
  "Barcode",
  "Option1 name",
  "Option1 value",
  "Option1 Linked To",
  "Option2 name",
  "Option2 value",
  "Option2 Linked To",
  "Option3 name",
  "Option3 value",
  "Option3 Linked To",
  "Price",
  "Compare-at price",
  "Cost per item",
  "Charge tax",
  "Tax code",
  "Unit price total measure",
  "Unit price total measure unit",
  "Unit price base measure",
  "Unit price base measure unit",
  "Inventory tracker",
  "Inventory quantity",
  "Continue selling when out of stock",
  "Weight value (grams)",
  "Weight unit for display",
  "Requires shipping",
  "Fulfillment service",
  "Product image URL",
  "Image position",
  "Image alt text",
  "Variant image URL",
  "Gift card",
  "SEO title",
  "SEO description",
  "Color (product.metafields.shopify.color-pattern)",
  "Google Shopping / Google product category",
  "Google Shopping / Gender",
  "Google Shopping / Age group",
  "Google Shopping / Manufacturer part number (MPN)",
  "Google Shopping / Ad group name",
  "Google Shopping / Ads labels",
  "Google Shopping / Condition",
  "Google Shopping / Custom product",
  "Google Shopping / Custom label 0",
  "Google Shopping / Custom label 1",
  "Google Shopping / Custom label 2",
  "Google Shopping / Custom label 3",
  "Google Shopping / Custom label 4",
] as const;

export type ShopifyCsvHeader = typeof SHOPIFY_CSV_HEADERS[number];
export type ShopifyCsvRow = Record<ShopifyCsvHeader, string>;

export const PRICE_HISTORY_CSV_HEADERS = [
  "Store",
  "Product title",
  "URL handle",
  "Variant ID",
  "Variant SKU",
  "Variant title",
  "Price",
  "Previous price",
  "Compare-at price",
  "Price change ($)",
  "Price change (%)",
  "Price changed",
  "Recorded at",
  "Scrape run ID",
] as const;

export type PriceHistoryCsvHeader = typeof PRICE_HISTORY_CSV_HEADERS[number];
export type PriceHistoryCsvRow = Record<PriceHistoryCsvHeader, string>;

// Review Required CSV — Shopify columns + 2 extra
export const REVIEW_REQUIRED_EXTRA_HEADERS = ["Confidence Score", "Missing Fields"] as const;
export const REVIEW_REQUIRED_HEADERS = [...SHOPIFY_CSV_HEADERS, ...REVIEW_REQUIRED_EXTRA_HEADERS] as const;

// --- Helpers ---

function escapeCell(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function serializeCsv(rows: Record<string, string>[], headers: readonly string[]): string {
  const headerLine = headers.map(escapeCell).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => escapeCell(row[h] ?? '')).join(',')
  );
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

export function buildShopifyCsvRows(
  product: any,
  storeSlug: string,
  googleConditionEnabled = false,
): ShopifyCsvRow[] {
  const rows: ShopifyCsvRow[] = [];
  const variants: any[] = product.variants || [];
  const images: any[] = product.images || [];
  const options: any[] = product.options || [];
  const urlHandle = `${storeSlug}-${product.handle || ''}`;
  const tags = product.tags
    ? (typeof product.tags === 'string' ? product.tags : product.tags.join(', '))
    : '';
  const tagsWithSlug = tags ? `${tags}, ${storeSlug}` : storeSlug;
  const seoTitle = (product.title || '').substring(0, 70);
  const seoDesc = (product.body_plain || '').replace(/\s+/g, ' ').substring(0, 320);

  function emptyRow(): ShopifyCsvRow {
    const row: any = {};
    for (const h of SHOPIFY_CSV_HEADERS) row[h] = '';
    return row as ShopifyCsvRow;
  }

  variants.forEach((variant, vIdx) => {
    const isFirst = vIdx === 0;
    const row = emptyRow();

    row["URL handle"] = urlHandle;

    if (isFirst) {
      row["Title"] = product.title || '';
      row["Description"] = product.body_html || '';
      row["Vendor"] = product.vendor || '';
      row["Product category"] = '';
      row["Type"] = product.product_type || '';
      row["Tags"] = tagsWithSlug;
      row["Published on online store"] = 'TRUE';
      row["Status"] = 'active';
      row["Option1 name"] = options[0]?.name || '';
      row["Option2 name"] = options[1]?.name || '';
      row["Option3 name"] = options[2]?.name || '';
      row["SEO title"] = seoTitle;
      row["SEO description"] = seoDesc;
      row["Gift card"] = 'FALSE';
    }

    row["SKU"] = variant.sku || '';
    row["Barcode"] = variant.barcode || '';
    row["Option1 value"] = variant.option1 || '';
    row["Option1 Linked To"] = '';
    row["Option2 value"] = variant.option2 || '';
    row["Option2 Linked To"] = '';
    row["Option3 value"] = variant.option3 || '';
    row["Option3 Linked To"] = '';
    row["Price"] = variant.price != null ? Number(variant.price).toFixed(2) : '';
    row["Compare-at price"] = variant.compare_at_price != null ? Number(variant.compare_at_price).toFixed(2) : '';
    row["Cost per item"] = '';
    row["Charge tax"] = 'TRUE';
    row["Tax code"] = '';
    row["Unit price total measure"] = '';
    row["Unit price total measure unit"] = '';
    row["Unit price base measure"] = '';
    row["Unit price base measure unit"] = '';
    row["Inventory tracker"] = '';
    row["Inventory quantity"] = String(variant.inventory_quantity ?? 0);
    row["Continue selling when out of stock"] = 'DENY';
    row["Weight value (grams)"] = String(variant.grams ?? 0);
    row["Weight unit for display"] = 'g';
    row["Requires shipping"] = 'TRUE';
    row["Fulfillment service"] = 'manual';

    if (isFirst && images.length > 0) {
      row["Product image URL"] = images[0].src || '';
      row["Image position"] = '1';
      row["Image alt text"] = images[0].alt || product.title || '';
    }

    row["Variant image URL"] = variant.featured_image_url || '';
    row["Color (product.metafields.shopify.color-pattern)"] = '';
    row["Google Shopping / Google product category"] = '';
    row["Google Shopping / Gender"] = '';
    row["Google Shopping / Age group"] = '';
    row["Google Shopping / Manufacturer part number (MPN)"] = '';
    row["Google Shopping / Ad group name"] = '';
    row["Google Shopping / Ads labels"] = '';
    row["Google Shopping / Condition"] = googleConditionEnabled ? 'New' : '';
    row["Google Shopping / Custom product"] = '';
    row["Google Shopping / Custom label 0"] = '';
    row["Google Shopping / Custom label 1"] = '';
    row["Google Shopping / Custom label 2"] = '';
    row["Google Shopping / Custom label 3"] = '';
    row["Google Shopping / Custom label 4"] = '';

    rows.push(row);
  });

  for (let i = 1; i < images.length; i++) {
    const row = emptyRow();
    row["URL handle"] = urlHandle;
    row["Product image URL"] = images[i].src || '';
    row["Image position"] = String(i + 1);
    row["Image alt text"] = images[i].alt || product.title || '';
    rows.push(row);
  }

  return rows;
}

export function buildPriceHistoryCsvRow(h: any, productTitle: string, urlHandle: string): PriceHistoryCsvRow {
  return {
    "Store": h.store_handle || '',
    "Product title": productTitle,
    "URL handle": urlHandle,
    "Variant ID": h.shopify_variant_id || '',
    "Variant SKU": h.variant_sku || '',
    "Variant title": h.variant_title || '',
    "Price": h.price != null ? Number(h.price).toFixed(2) : '',
    "Previous price": h.previous_price != null ? Number(h.previous_price).toFixed(2) : '',
    "Compare-at price": h.compare_at_price != null ? Number(h.compare_at_price).toFixed(2) : '',
    "Price change ($)": h.price_delta != null ? Number(h.price_delta).toFixed(2) : '',
    "Price change (%)": h.price_delta_pct != null ? (Number(h.price_delta_pct) * 100).toFixed(2) + '%' : '',
    "Price changed": h.price_changed ? 'TRUE' : 'FALSE',
    "Recorded at": h.recorded_at || '',
    "Scrape run ID": h.scrape_run_id || '',
  };
}

// ─── Scraped Products → Shopify CSV ─────────────────────────────────────────

import type { ScrapedProduct } from '@/hooks/useScrapedProducts';

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function emptyShopifyRow(): ShopifyCsvRow {
  const row: any = {};
  for (const h of SHOPIFY_CSV_HEADERS) row[h] = '';
  return row as ShopifyCsvRow;
}

export function buildShopifyRowFromScrapedProduct(p: ScrapedProduct): ShopifyCsvRow[] {
  const rows: ShopifyCsvRow[] = [];
  const handle = p.external_id
    ? `${p.source_key}-${p.external_id}`
    : `${p.source_key}-${slugify(p.title).substring(0, 60)}`;

  const row = emptyShopifyRow();
  row["Title"] = p.title;
  row["URL handle"] = handle;
  row["Description"] = p.description_html ?? '';
  row["Vendor"] = p.brand ?? '';
  row["Product category"] = p.category ?? '';
  row["Type"] = p.category ?? '';
  row["Tags"] = [...(p.tags ?? []), p.source_name, 'au-pharmacy-scout'].join(', ');
  row["Published on online store"] = 'TRUE';
  row["Status"] = 'active';
  row["SKU"] = p.sku ?? '';
  row["Barcode"] = p.gtin ?? '';
  row["Option1 name"] = 'Title';
  row["Option1 value"] = 'Default Title';
  // Price — NEVER blank in Shopify Ready export (caller must filter price != null)
  row["Price"] = p.price != null ? Number(p.price).toFixed(2) : '';
  row["Compare-at price"] = p.was_price != null ? Number(p.was_price).toFixed(2) : '';
  row["Charge tax"] = 'TRUE';
  row["Inventory quantity"] = '0';
  row["Continue selling when out of stock"] = 'DENY';
  row["Weight value (grams)"] = '0';
  row["Weight unit for display"] = 'g';
  row["Requires shipping"] = 'TRUE';
  row["Fulfillment service"] = 'manual';
  row["Gift card"] = 'FALSE';
  row["Product image URL"] = p.image_url ?? '';
  row["Image position"] = p.image_url ? '1' : '';
  row["Image alt text"] = p.image_url ? p.title : '';
  row["SEO title"] = p.title.substring(0, 70);
  row["SEO description"] = (p.description_plain ?? '').substring(0, 320);
  rows.push(row);

  // Additional image rows
  const extraImages = (p.image_urls ?? []).filter(u => u !== p.image_url);
  extraImages.forEach((imgUrl, i) => {
    const imgRow = emptyShopifyRow();
    imgRow["URL handle"] = handle;
    imgRow["Product image URL"] = imgUrl;
    imgRow["Image position"] = String(i + 2);
    imgRow["Image alt text"] = p.title;
    rows.push(imgRow);
  });

  return rows;
}

export function buildReviewRequiredRow(p: ScrapedProduct): Record<string, string> {
  const shopifyRows = buildShopifyRowFromScrapedProduct(p);
  const firstRow = shopifyRows[0] as Record<string, string>;
  return {
    ...firstRow,
    'Confidence Score': String(p.confidence_score),
    'Missing Fields': (p.missing_fields ?? []).join('; '),
  };
}

// ─── Export mode builders ────────────────────────────────────────────────────

export function exportShopifyReadyCsv(products: ScrapedProduct[]): void {
  // Only products with price
  const eligible = products.filter(p => p.confidence_score >= 90 && p.price != null);
  if (eligible.length === 0) {
    return;
  }
  const rows: Record<string, string>[] = [];
  for (const p of eligible) {
    rows.push(...buildShopifyRowFromScrapedProduct(p));
  }
  const csv = serializeCsv(rows, SHOPIFY_CSV_HEADERS);
  downloadBlob(csv, `shopify-ready-${Date.now()}.csv`);
}

export function exportReviewRequiredCsv(products: ScrapedProduct[]): void {
  const eligible = products.filter(
    p => (p.confidence_score >= 60 && p.confidence_score < 90) || p.price == null,
  );
  const rows: Record<string, string>[] = eligible.map(buildReviewRequiredRow);
  const headers = [...SHOPIFY_CSV_HEADERS, ...REVIEW_REQUIRED_EXTRA_HEADERS] as readonly string[];
  const csv = serializeCsv(rows, headers);
  downloadBlob(csv, `review-required-${Date.now()}.csv`);
}

export function downloadBlob(content: string, filename: string, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
