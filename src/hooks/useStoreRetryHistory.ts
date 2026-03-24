import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

function inferRetryMode(settings: any): 'slow_pacing' | 'smaller_batch' | 'default' {
  if (!settings || typeof settings !== 'object') return 'default';
  if ((settings.interPageDelay ?? 0) >= 2000) return 'slow_pacing';
  if ((settings.maxConcurrentStores ?? 99) <= 1) return 'smaller_batch';
  return 'default';
}

export function useStoreRetryHistory(storeId?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['store_retry_history', user?.id, storeId],
    enabled: !!user && !!storeId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scrape_run_stores')
        .select('id,scrape_run_id,status,terminal_status,message,updated_at,finished_at,page_count,product_count,collections_completed,collections_failed,scrape_runs!inner(id,created_at,settings,status,run_status)')
        .eq('user_id', user!.id)
        .eq('store_id', storeId!)
        .order('updated_at', { ascending: false })
        .limit(12);

      if (error) throw error;

      const rows = (data ?? []).map((row: any) => {
        const run = Array.isArray(row.scrape_runs) ? row.scrape_runs[0] : row.scrape_runs;
        const mode = inferRetryMode(run?.settings);
        return {
          id: row.id,
          scrapeRunId: row.scrape_run_id,
          status: row.status,
          terminalStatus: row.terminal_status,
          message: row.message,
          updatedAt: row.updated_at,
          finishedAt: row.finished_at,
          pageCount: row.page_count ?? 0,
          productCount: row.product_count ?? 0,
          collectionsCompleted: row.collections_completed ?? 0,
          collectionsFailed: row.collections_failed ?? 0,
          runCreatedAt: run?.created_at,
          runStatus: run?.run_status || run?.status || 'unknown',
          retryMode: mode,
          modeLabel: mode === 'slow_pacing' ? 'Slow pacing' : mode === 'smaller_batch' ? 'Smaller batch' : 'Default',
        };
      });

      return rows.map((entry, index) => {
        const baseline = rows[index + 1] ?? null;
        const deltaProducts = baseline ? entry.productCount - baseline.productCount : null;
        const deltaPages = baseline ? entry.pageCount - baseline.pageCount : null;
        const deltaCollections = baseline ? entry.collectionsCompleted - baseline.collectionsCompleted : null;
        const beatBaseline = !!baseline && (
          deltaProducts! > 0 ||
          deltaPages! > 0 ||
          deltaCollections! > 0 ||
          (baseline.status === 'error' && entry.status === 'completed')
        );

        return {
          ...entry,
          baseline,
          deltaProducts,
          deltaPages,
          deltaCollections,
          beatBaseline,
          helped: beatBaseline || (entry.status === 'completed' && (entry.productCount > 0 || entry.pageCount > 0)),
        };
      });
    },
  });
}
