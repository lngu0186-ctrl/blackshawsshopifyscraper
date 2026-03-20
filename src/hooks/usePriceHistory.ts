import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export interface PriceChangeFilter {
  storeId?: string;
  dateFrom?: string;
  dateTo?: string;
  direction?: 'any' | 'increase' | 'decrease';
  minAbsChange?: number;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export function usePriceHistory(filter: PriceChangeFilter) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['price_history', user?.id, filter],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from('variant_price_history')
        .select('*, products(title, store_name, store_slug, handle)', { count: 'exact' })
        .eq('user_id', user!.id)
        .eq('price_changed', true);

      if (filter.storeId) query = query.eq('store_id', filter.storeId);
      if (filter.dateFrom) query = query.gte('recorded_at', filter.dateFrom);
      if (filter.dateTo) query = query.lte('recorded_at', filter.dateTo);
      if (filter.direction === 'increase') query = query.gt('price_delta', 0);
      if (filter.direction === 'decrease') query = query.lt('price_delta', 0);
      if (filter.minAbsChange != null) {
        query = query.or(`price_delta.gte.${filter.minAbsChange},price_delta.lte.${-filter.minAbsChange}`);
      }

      const sortCol = filter.sortBy || 'recorded_at';
      query = query.order(sortCol, { ascending: filter.sortDir === 'asc' });

      const from = (filter.page - 1) * filter.pageSize;
      const to = from + filter.pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return { items: data ?? [], total: count ?? 0 };
    },
  });
}

export function useVariantPriceHistory(variantId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['variant_price_history', variantId],
    enabled: !!user && !!variantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('variant_price_history')
        .select('*')
        .eq('variant_id', variantId!)
        .order('recorded_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStoreMetricsHistory(storeId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['store_metrics_history', storeId],
    enabled: !!user && !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_metrics_history')
        .select('*')
        .eq('store_id', storeId!)
        .eq('user_id', user!.id)
        .order('snapshot_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}
