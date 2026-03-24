import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import type { Store } from '@/types/schemas';

function inferRetryMode(settings: any): 'slow_pacing' | 'smaller_batch' | 'default' {
  if (!settings || typeof settings !== 'object') return 'default';
  if ((settings.interPageDelay ?? 0) >= 2000) return 'slow_pacing';
  if ((settings.maxConcurrentStores ?? 99) <= 1) return 'smaller_batch';
  return 'default';
}

function modeLabel(mode: string) {
  if (mode === 'slow_pacing') return 'Slow pacing';
  if (mode === 'smaller_batch') return 'Smaller batch';
  return 'Default';
}

export function useBestKnownModes(storeIds?: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['best_known_modes', user?.id, (storeIds ?? []).join(',')],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from('scrape_run_stores')
        .select('store_id,status,page_count,product_count,collections_completed,scrape_runs!inner(settings,created_at),stores!inner(id,preferred_retry_mode)')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false })
        .limit(400);

      if (storeIds?.length) query = query.in('store_id', storeIds);
      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []).map((row: any) => {
        const run = Array.isArray(row.scrape_runs) ? row.scrape_runs[0] : row.scrape_runs;
        const store = Array.isArray(row.stores) ? row.stores[0] : row.stores;
        return {
          storeId: row.store_id,
          status: row.status,
          pageCount: row.page_count ?? 0,
          productCount: row.product_count ?? 0,
          collectionsCompleted: row.collections_completed ?? 0,
          createdAt: run?.created_at,
          mode: inferRetryMode(run?.settings),
          preferredMode: (store?.preferred_retry_mode as Store['preferred_retry_mode']) || 'auto',
        };
      }).filter((r: any) => !!r.storeId);

      const byStore = new Map<string, any[]>();
      for (const row of rows) {
        const list = byStore.get(row.storeId) ?? [];
        list.push(row);
        byStore.set(row.storeId, list);
      }

      const out: Record<string, { mode: 'slow_pacing' | 'smaller_batch' | 'default'; label: string; score: number; preferredMode: Store['preferred_retry_mode'] | 'auto' }> = {};
      for (const [storeId, storeRows] of byStore.entries()) {
        const preferredMode = storeRows[0]?.preferredMode || 'auto';
        if (preferredMode !== 'auto') {
          out[storeId] = {
            mode: preferredMode as any,
            label: `${modeLabel(preferredMode)} (pinned)`,
            score: 999,
            preferredMode,
          };
          continue;
        }

        const scored = new Map<string, number>();
        for (let i = 0; i < storeRows.length; i++) {
          const entry = storeRows[i];
          const baseline = storeRows[i + 1] ?? null;
          const deltaProducts = baseline ? entry.productCount - baseline.productCount : 0;
          const deltaPages = baseline ? entry.pageCount - baseline.pageCount : 0;
          const deltaCollections = baseline ? entry.collectionsCompleted - baseline.collectionsCompleted : 0;
          const beatBaseline = !!baseline && (
            deltaProducts > 0 || deltaPages > 0 || deltaCollections > 0 || (baseline.status === 'error' && entry.status === 'completed')
          );
          const helped = beatBaseline || (entry.status === 'completed' && (entry.productCount > 0 || entry.pageCount > 0));
          let score = scored.get(entry.mode) ?? 0;
          if (beatBaseline) score += 3;
          else if (helped) score += 2;
          else if (entry.status === 'completed') score += 1;
          if (deltaProducts > 0) score += 1;
          if (deltaPages > 0) score += 1;
          scored.set(entry.mode, score);
        }
        const [bestMode, bestScore] = [...scored.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['default', 0];
        out[storeId] = { mode: bestMode as any, label: modeLabel(bestMode), score: bestScore, preferredMode };
      }

      return out;
    },
  });
}
