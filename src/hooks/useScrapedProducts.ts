import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ScrapedProduct {
  id: string;
  user_id: string;
  source_key: string;
  source_name: string;
  source_url: string;
  external_id: string | null;
  sku: string | null;
  gtin: string | null;
  title: string;
  brand: string | null;
  category: string | null;
  category_path: string[];
  description_html: string | null;
  description_plain: string | null;
  price: number | null;
  was_price: number | null;
  currency: string;
  price_text: string | null;
  image_url: string | null;
  image_urls: string[];
  in_stock: boolean | null;
  availability_text: string | null;
  size_text: string | null;
  tags: string[];
  scrape_method: string;
  listing_scraped: boolean;
  detail_scraped: boolean;
  detail_fetch_attempts: number;
  detail_fetch_error: string | null;
  confidence_score: number;
  missing_fields: string[];
  scrape_status: 'enriched' | 'partial' | 'failed';
  raw_listing: Record<string, unknown> | null;
  raw_detail: Record<string, unknown> | null;
  first_seen_at: string;
  scraped_at: string;
  enriched_at: string | null;
  last_exported_at: string | null;
}

export interface DataQualityStats {
  total: number;
  ready: number;   // score >= 90
  review: number;  // score 60-89
  partial: number; // score < 60
  missingPrice: number;
  missingImage: number;
  missingDescription: number;
  detailFailed: number;
}

export type ExportMode = 'shopify_ready' | 'review_required' | 'full_raw';

export function useScrapedProducts(filters?: {
  source_key?: string;
  scrape_status?: string;
  missing_field?: string;
  confidence_min?: number;
  confidence_max?: number;
  page?: number;
  pageSize?: number;
}) {
  const { user } = useAuth();
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 50;

  return useQuery({
    queryKey: ['scraped_products', user?.id, filters],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from('scraped_products')
        .select('*', { count: 'exact' })
        .eq('user_id', user!.id)
        .order('confidence_score', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (filters?.source_key) query = query.eq('source_key', filters.source_key);
      if (filters?.scrape_status) query = query.eq('scrape_status', filters.scrape_status);
      if (filters?.confidence_min != null) query = query.gte('confidence_score', filters.confidence_min);
      if (filters?.confidence_max != null) query = query.lte('confidence_score', filters.confidence_max);
      if (filters?.missing_field) query = query.contains('missing_fields', [filters.missing_field]);

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: (data ?? []) as ScrapedProduct[], count: count ?? 0 };
    },
  });
}

export function useDataQualityStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['data_quality_stats', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<DataQualityStats> => {
      const { data, error } = await supabase
        .from('scraped_products')
        .select('confidence_score, missing_fields, detail_fetch_error')
        .eq('user_id', user!.id);
      if (error) throw error;

      const rows = data ?? [];
      return {
        total: rows.length,
        ready: rows.filter(r => r.confidence_score >= 90).length,
        review: rows.filter(r => r.confidence_score >= 60 && r.confidence_score < 90).length,
        partial: rows.filter(r => r.confidence_score < 60).length,
        missingPrice: rows.filter(r => (r.missing_fields ?? []).includes('price')).length,
        missingImage: rows.filter(r => (r.missing_fields ?? []).includes('image_url')).length,
        missingDescription: rows.filter(r => (r.missing_fields ?? []).includes('description_html')).length,
        detailFailed: rows.filter(r => r.detail_fetch_error !== null).length,
      };
    },
    staleTime: 10_000,
  });
}

export function useScrapeSource() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: { source_key: string; job_id?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/scrape-source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ success: boolean; discovered: number; upserted: number; needs_enrichment: number }>;
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['scraped_products'] });
      queryClient.invalidateQueries({ queryKey: ['data_quality_stats'] });
      queryClient.invalidateQueries({ queryKey: ['scrape_jobs'] });
      toast.success(`Discovered ${data.discovered} products from ${vars.source_key}`);
    },
    onError: (e: any) => toast.error(e.message || 'Scrape failed'),
  });
}

export function useEnrichProducts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { source_key?: string; limit?: number; job_id?: string; product_id?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/enrich-products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ success: boolean; processed: number; enriched: number; failed: number; remaining: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scraped_products'] });
      queryClient.invalidateQueries({ queryKey: ['data_quality_stats'] });
    },
    onError: (e: any) => toast.error(e.message || 'Enrichment failed'),
  });
}

export function useCreateScrapeJob() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: { source_key: string; job_type: string }) => {
      const { data, error } = await supabase
        .from('scrape_jobs')
        .insert({ ...params, user_id: user!.id, status: 'queued' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scrape_jobs'] }),
  });
}

export function useScrapeJobs() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['scrape_jobs', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scrape_jobs')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 3000,
  });
}
