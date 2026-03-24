import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export function useRecentRunSummaries(limit = 8) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['recent_run_summaries', user?.id, limit],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scrape_runs')
        .select('id,status,run_status,total_stores,completed_stores,total_products,total_price_changes,error_count,pages_visited,collections_total,collections_completed,collections_failed,collections_skipped,active_store_name,latest_message,last_event_at,last_success_at,created_at,started_at,finished_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRunObservabilitySummary(limit = 8) {
  const { data: runs, isLoading } = useRecentRunSummaries(limit);

  const summary = useMemo(() => {
    const rows = runs ?? [];
    const active = rows.find((r: any) => r.status === 'running');
    const latestFinished = rows.find((r: any) => ['completed', 'failed', 'cancelled'].includes(r.status));
    const completed = rows.filter((r: any) => r.status === 'completed');
    const failed = rows.filter((r: any) => r.status === 'failed');

    return {
      active,
      latestFinished,
      completionRate: rows.length ? Math.round((completed.length / rows.length) * 100) : 0,
      failureRate: rows.length ? Math.round((failed.length / rows.length) * 100) : 0,
      avgPagesVisited: completed.length
        ? Math.round(completed.reduce((sum: number, r: any) => sum + (r.pages_visited ?? 0), 0) / completed.length)
        : 0,
      avgCollectionsCompleted: completed.length
        ? Math.round(completed.reduce((sum: number, r: any) => sum + (r.collections_completed ?? 0), 0) / completed.length)
        : 0,
    };
  }, [runs]);

  return { runs: runs ?? [], summary, isLoading };
}
