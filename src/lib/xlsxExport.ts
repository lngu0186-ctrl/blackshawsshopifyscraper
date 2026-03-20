import * as XLSX from 'xlsx';
import { buildShopifyCsvRows, SHOPIFY_CSV_HEADERS, PRICE_HISTORY_CSV_HEADERS } from './csvExport';

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
