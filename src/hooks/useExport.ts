import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import {
  buildShopifyCsvRows, serializeCsv, downloadBlob,
  buildPriceHistoryCsvRow,
  SHOPIFY_CSV_HEADERS, PRICE_HISTORY_CSV_HEADERS,
} from '@/lib/csvExport';
import { getSettings } from '@/lib/scrapeClient';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

async function fetchProductsForExport(userId: string, storeIds?: string[], changedOnly = false) {
  let query = supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('user_id', userId);

  if (storeIds && storeIds.length > 0) {
    query = query.in('store_id', storeIds);
  }
  if (changedOnly) {
    query = query.or('last_exported_at.is.null,last_changed_at.gt.last_exported_at');
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export function useExport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const exportShopifyCsv = useMutation({
    mutationFn: async ({ storeIds, changedOnly }: { storeIds?: string[]; changedOnly?: boolean }) => {
      const settings = getSettings();
      const products = await fetchProductsForExport(user!.id, storeIds, changedOnly);
      if (products.length === 0) {
        toast.info('No products to export');
        return;
      }

      const rows: Record<string, string>[] = [];
      for (const product of products) {
        const csvRows = buildShopifyCsvRows(product, product.store_slug, settings.googleShoppingCondition);
        rows.push(...csvRows);
      }

      const csv = serializeCsv(rows, SHOPIFY_CSV_HEADERS);
      downloadBlob(csv, `shopify-export-${Date.now()}.csv`);

      // Log export run
      await supabase.from('export_runs').insert({
        user_id: user!.id,
        scope: storeIds ? 'selected' : 'all',
        store_ids: storeIds ? storeIds : null,
        changed_only: changedOnly ?? false,
        export_type: 'shopify_csv',
        row_count: rows.length,
      });

      // Update last_exported_at
      const productIds = products.map((p: any) => p.id);
      await supabase.from('products').update({ last_exported_at: new Date().toISOString() })
        .in('id', productIds);

      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`Exported ${rows.length} rows`);
    },
    onError: (e: any) => toast.error(e.message || 'Export failed'),
  });

  const exportJson = useMutation({
    mutationFn: async ({ storeIds, changedOnly }: { storeIds?: string[]; changedOnly?: boolean }) => {
      const products = await fetchProductsForExport(user!.id, storeIds, changedOnly);
      const json = JSON.stringify(products, null, 2);
      downloadBlob(json, `products-export-${Date.now()}.json`, 'application/json');
      toast.success(`Exported ${products.length} products`);
    },
    onError: (e: any) => toast.error(e.message || 'Export failed'),
  });

  const exportExcel = useMutation({
    mutationFn: async ({ storeIds, changedOnly }: { storeIds?: string[]; changedOnly?: boolean }) => {
      const settings = getSettings();
      const products = await fetchProductsForExport(user!.id, storeIds, changedOnly);
      const rows: Record<string, string>[] = [];
      for (const product of products) {
        const csvRows = buildShopifyCsvRows(product, product.store_slug, settings.googleShoppingCondition);
        rows.push(...csvRows);
      }

      const ws = XLSX.utils.json_to_sheet(rows, { header: SHOPIFY_CSV_HEADERS as unknown as string[] });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Products');
      XLSX.writeFile(wb, `shopify-export-${Date.now()}.xlsx`);
      toast.success(`Exported ${rows.length} rows as Excel`);
    },
    onError: (e: any) => toast.error(e.message || 'Export failed'),
  });

  const exportPriceHistoryCsv = useMutation({
    mutationFn: async ({ storeIds }: { storeIds?: string[] }) => {
      let query = supabase
        .from('variant_price_history')
        .select('*, products(title, store_slug, handle)')
        .eq('user_id', user!.id)
        .eq('price_changed', true)
        .order('recorded_at', { ascending: false });

      if (storeIds && storeIds.length > 0) query = query.in('store_id', storeIds);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []).map((h: any) => buildPriceHistoryCsvRow(
        h,
        h.products?.title || '',
        `${h.products?.store_slug || ''}-${h.products?.handle || ''}`,
      ));

      const csv = serializeCsv(rows, PRICE_HISTORY_CSV_HEADERS);
      downloadBlob(csv, `price-history-${Date.now()}.csv`);

      await supabase.from('export_runs').insert({
        user_id: user!.id,
        scope: storeIds ? 'selected' : 'all',
        store_ids: storeIds ?? null,
        changed_only: false,
        export_type: 'price_history_csv',
        row_count: rows.length,
      });

      toast.success(`Exported ${rows.length} price history rows`);
    },
    onError: (e: any) => toast.error(e.message || 'Export failed'),
  });

  return { exportShopifyCsv, exportJson, exportExcel, exportPriceHistoryCsv };
}
