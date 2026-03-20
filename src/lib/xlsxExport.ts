import * as XLSX from 'xlsx';
import { buildShopifyCsvRows, SHOPIFY_CSV_HEADERS, PRICE_HISTORY_CSV_HEADERS } from './csvExport';
import type { ScrapedProduct } from '@/hooks/useScrapedProducts';

// ─── Legacy Shopify product export (used by existing Products page) ──────────

export function exportProductsToExcel(
  products: any[],
  storeSlug: string,
  googleConditionEnabled: boolean,
  filename: string,
): void {
  const rows: any[] = [];
  for (const product of products) {
    rows.push(...buildShopifyCsvRows(product, storeSlug, googleConditionEnabled));
  }
  const ws = XLSX.utils.json_to_sheet(rows, { header: SHOPIFY_CSV_HEADERS as unknown as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  XLSX.writeFile(wb, filename);
}

export function exportPriceHistoryToExcel(rows: any[], filename: string): void {
  const headers = PRICE_HISTORY_CSV_HEADERS as unknown as string[];
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Price History');
  XLSX.writeFile(wb, filename);
}

// ─── Full Raw Excel export from scraped_products ────────────────────────────

const FULL_RAW_HEADERS = [
  'Source',
  'Source Domain',
  'Product Title',
  'Brand',
  'Category',
  'Category Path',
  'Price',
  'Was Price',
  'Currency',
  'Price Text',
  'In Stock',
  'Availability',
  'Size / Pack',
  'Description (plain)',
  'Product URL',
  'Image URL',
  'All Images',
  'SKU',
  'GTIN',
  'Tags',
  'Confidence Score',
  'Missing Fields',
  'Scrape Method',
  'Scrape Status',
  'Detail Scraped',
  'Enriched At',
  'Scraped At',
] as const;

// Confidence tier fill colours
const FILL_ENRICHED = { type: 'pattern' as const, patternType: 'solid' as const, fgColor: { rgb: 'D1FAE5' } };  // green-100
const FILL_REVIEW   = { type: 'pattern' as const, patternType: 'solid' as const, fgColor: { rgb: 'FEF3C7' } };  // amber-100
const FILL_PARTIAL  = { type: 'pattern' as const, patternType: 'solid' as const, fgColor: { rgb: 'FEE2E2' } };  // red-100

export function exportFullRawExcel(products: ScrapedProduct[], filename?: string): void {
  const wb = XLSX.utils.book_new();
  const wsData: any[][] = [];

  // Header row
  wsData.push(FULL_RAW_HEADERS as unknown as string[]);

  for (const p of products) {
    wsData.push([
      p.source_name,
      new URL(p.source_url).hostname,
      p.title,
      p.brand ?? '',
      p.category ?? '',
      (p.category_path ?? []).join(' > '),
      // Numeric cells for price — use raw numbers not strings
      p.price ?? '',
      p.was_price ?? '',
      p.currency,
      p.price_text ?? '',
      p.in_stock === true ? 'In Stock' : p.in_stock === false ? 'Out of Stock' : '',
      p.availability_text ?? '',
      p.size_text ?? '',
      p.description_plain?.substring(0, 500) ?? '',
      p.source_url,
      p.image_url ?? '',
      (p.image_urls ?? []).join(', '),
      p.sku ?? '',
      p.gtin ?? '',
      (p.tags ?? []).join(', '),
      p.confidence_score,
      (p.missing_fields ?? []).join('; '),
      p.scrape_method,
      p.scrape_status,
      p.detail_scraped ? 'Yes' : 'No',
      p.enriched_at ?? '',
      p.scraped_at,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set numeric type for Price and Was Price columns (indices 6 and 7, 1-based = G and H)
  const priceColIdx = 6; // 0-based
  const wasPriceColIdx = 7;
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let row = 1; row <= range.e.r; row++) {
    for (const colIdx of [priceColIdx, wasPriceColIdx]) {
      const addr = XLSX.utils.encode_cell({ r: row, c: colIdx });
      if (ws[addr] && ws[addr].v !== '') {
        ws[addr].t = 'n';
        ws[addr].z = '#,##0.00';
      }
    }
  }

  // Row colouring by confidence score (column index 20 = Confidence Score)
  const confidenceColIdx = 20;
  for (let row = 1; row <= range.e.r; row++) {
    const addr = XLSX.utils.encode_cell({ r: row, c: confidenceColIdx });
    const score = ws[addr]?.v as number ?? 0;
    const fill = score >= 90 ? FILL_ENRICHED : score >= 60 ? FILL_REVIEW : FILL_PARTIAL;

    // Apply fill to all cells in this row
    for (let col = 0; col <= range.e.c; col++) {
      const cellAddr = XLSX.utils.encode_cell({ r: row, c: col });
      if (!ws[cellAddr]) ws[cellAddr] = { t: 'z', v: '' };
      ws[cellAddr].s = { fill };
    }
  }

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

  // Auto-filter
  ws['!autofilter'] = { ref: ws['!ref'] ?? 'A1' };

  // Column widths
  ws['!cols'] = [
    { wch: 18 }, // Source
    { wch: 28 }, // Source Domain
    { wch: 50 }, // Product Title
    { wch: 20 }, // Brand
    { wch: 22 }, // Category
    { wch: 35 }, // Category Path
    { wch: 12 }, // Price
    { wch: 12 }, // Was Price
    { wch: 10 }, // Currency
    { wch: 14 }, // Price Text
    { wch: 12 }, // In Stock
    { wch: 16 }, // Availability
    { wch: 16 }, // Size / Pack
    { wch: 50 }, // Description
    { wch: 55 }, // Product URL
    { wch: 55 }, // Image URL
    { wch: 60 }, // All Images
    { wch: 16 }, // SKU
    { wch: 16 }, // GTIN
    { wch: 30 }, // Tags
    { wch: 16 }, // Confidence Score
    { wch: 30 }, // Missing Fields
    { wch: 16 }, // Scrape Method
    { wch: 14 }, // Scrape Status
    { wch: 14 }, // Detail Scraped
    { wch: 22 }, // Enriched At
    { wch: 22 }, // Scraped At
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'All Products');
  XLSX.writeFile(wb, filename ?? `full-raw-export-${Date.now()}.xlsx`);
}
