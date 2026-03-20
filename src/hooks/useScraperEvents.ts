/**
 * useScraperEvents — queries the scraper_events table for diagnostics.
 * The scraper_events table is the canonical lifecycle event log.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export interface ScraperEvent {
  id: string;
  created_at: string;
  user_id: string;
  store_id: string | null;
  run_id: string | null;
  product_id: string | null;
  stage: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  url: string | null;
  reason_code: string | null;
  message: string;
  raw_error: string | null;
  source_platform: string | null;
  // joined from stores:
  store_name?: string | null;
}

export interface ScraperEventsFilters {
  severity?: string;
  stage?: string;
  store_id?: string;
  dateRange?: '24h' | '7d' | '30d' | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useScraperEvents(filters?: ScraperEventsFilters) {
  const { user } = useAuth();
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 100;

  return useQuery({
    queryKey: ['scraper_events', user?.id, filters],
    enabled: !!user,
    staleTime: 10_000,
    queryFn: async () => {
      let query = supabase
        .from('scraper_events')
        .select('*', { count: 'exact' })
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (filters?.severity && filters.severity !== 'all') {
        query = query.eq('severity', filters.severity);
      }
      if (filters?.stage && filters.stage !== 'all') {
        query = query.eq('stage', filters.stage);
      }
      if (filters?.store_id && filters.store_id !== 'all') {
        query = query.eq('store_id', filters.store_id);
      }
      if (filters?.dateRange && filters.dateRange !== 'all') {
        const now = new Date();
        const hours = filters.dateRange === '24h' ? 24 : filters.dateRange === '7d' ? 168 : 720;
        const since = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', since);
      }
      if (filters?.search) {
        query = query.or(`message.ilike.%${filters.search}%,url.ilike.%${filters.search}%,stage.ilike.%${filters.search}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: (data ?? []) as ScraperEvent[], count: count ?? 0 };
    },
  });
}

export function useScraperEventsSummary() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['scraper_events_summary', user?.id],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      const [totalRes, criticalRes, warningRes, failedRes, stagesRes] = await Promise.all([
        supabase
          .from('scraper_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id),
        supabase
          .from('scraper_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('severity', 'critical'),
        supabase
          .from('scraper_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('severity', 'warning'),
        supabase
          .from('scraper_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .in('severity', ['error', 'critical']),
        // Get distinct stages that have errors/criticals
        supabase
          .from('scraper_events')
          .select('stage')
          .eq('user_id', user!.id)
          .in('severity', ['error', 'critical']),
      ]);

      const failedStages = new Set(
        (stagesRes.data ?? []).map((r: any) => r.stage).filter(Boolean)
      ).size;

      return {
        totalEvents: totalRes.count ?? 0,
        criticalErrors: criticalRes.count ?? 0,
        warnings: warningRes.count ?? 0,
        failedStages,
      };
    },
  });
}

export function useScraperEventStages() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['scraper_event_stages', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scraper_events')
        .select('stage')
        .eq('user_id', user!.id);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r: any) => r.stage).filter(Boolean))) as string[];
    },
  });
}
