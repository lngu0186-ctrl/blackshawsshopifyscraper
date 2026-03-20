import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ScrapeDiagnostic {
  id: string;
  user_id: string;
  scrape_job_id: string | null;
  store_id: string | null;
  source_key: string | null;
  stage: string;
  status: 'success' | 'warning' | 'failed' | 'skipped';
  severity: 'info' | 'warning' | 'error' | 'critical';
  url: string | null;
  http_status: number | null;
  parser_used: string | null;
  selector_used: string | null;
  retry_count: number;
  duration_ms: number | null;
  field_name: string | null;
  extracted_value_preview: string | null;
  missing_fields: string[];
  failure_reason: string | null;
  raw_error: string | null;
  debug_payload: Record<string, unknown> | null;
  ai_analysis: string | null;
  ai_recommendation: string | null;
  created_at: string;
}

export interface DiagnosticsFilters {
  source_key?: string;
  stage?: string;
  status?: string;
  severity?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useDiagnostics(filters?: DiagnosticsFilters) {
  const { user } = useAuth();
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 50;

  return useQuery({
    queryKey: ['scrape_diagnostics', user?.id, filters],
    enabled: !!user,
    staleTime: 10_000,
    queryFn: async () => {
      let query = supabase
        .from('scrape_diagnostics')
        .select('*', { count: 'exact' })
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (filters?.source_key) query = query.eq('source_key', filters.source_key);
      if (filters?.stage) query = query.eq('stage', filters.stage);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.severity) query = query.eq('severity', filters.severity);
      if (filters?.search) {
        query = query.or(
          `failure_reason.ilike.%${filters.search}%,url.ilike.%${filters.search}%,raw_error.ilike.%${filters.search}%`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: (data ?? []) as ScrapeDiagnostic[], count: count ?? 0 };
    },
  });
}

export function useDiagnosticsSummary() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['diagnostics_summary', user?.id],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scrape_diagnostics')
        .select('source_key, stage, status, severity, field_name')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      const rows = data ?? [];
      const bySource: Record<string, { total: number; failed: number; warnings: number; stages: Set<string> }> = {};

      for (const r of rows) {
        const k = r.source_key ?? 'unknown';
        if (!bySource[k]) bySource[k] = { total: 0, failed: 0, warnings: 0, stages: new Set() };
        bySource[k].total++;
        if (r.status === 'failed') bySource[k].failed++;
        if (r.status === 'warning') bySource[k].warnings++;
        if (r.stage) bySource[k].stages.add(r.stage);
      }

      const totalErrors = rows.filter(r => r.status === 'failed').length;
      const totalWarnings = rows.filter(r => r.status === 'warning').length;
      const criticalCount = rows.filter(r => r.severity === 'critical').length;

      // Stage failure breakdown
      const stageFailures: Record<string, number> = {};
      for (const r of rows.filter(r => r.status === 'failed')) {
        stageFailures[r.stage] = (stageFailures[r.stage] ?? 0) + 1;
      }

      // Field failure breakdown
      const fieldFailures: Record<string, number> = {};
      for (const r of rows.filter(r => r.status === 'failed' && r.field_name)) {
        fieldFailures[r.field_name!] = (fieldFailures[r.field_name!] ?? 0) + 1;
      }

      return {
        totalErrors,
        totalWarnings,
        criticalCount,
        bySource: Object.entries(bySource).map(([key, val]) => ({
          source_key: key,
          ...val,
          stages: Array.from(val.stages),
        })),
        stageFailures,
        fieldFailures,
      };
    },
  });
}

export function useAnalyzeFailure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      diagnostic_id?: string;
      failure_data?: Record<string, unknown>;
      source_key?: string;
      run_summary?: Record<string, unknown>;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/analyze-failure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(params),
      });
      if (res.status === 429) throw new Error('Rate limit reached. Please try again shortly.');
      if (res.status === 402) throw new Error('AI credits exhausted. Please add funds in Settings → Workspace → Usage.');
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ success: boolean; analysis: Record<string, unknown> }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrape_diagnostics'] });
    },
    onError: (e: any) => toast.error(e.message || 'AI analysis failed'),
  });
}

// Write a diagnostic record (called from scrape edge functions or client-side on failure)
export function useWriteDiagnostic() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (diag: Omit<ScrapeDiagnostic, 'id' | 'user_id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('scrape_diagnostics')
        .insert({ ...diag, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrape_diagnostics'] });
      queryClient.invalidateQueries({ queryKey: ['diagnostics_summary'] });
    },
  });
}
