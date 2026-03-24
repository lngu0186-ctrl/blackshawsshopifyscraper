import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { getSettings, scrapeStore } from '@/lib/scrapeClient';
import { useAuth } from './useAuth';
import type { Settings, Store } from '@/types/schemas';

async function validateStoreUrl(url: string, accessToken: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const res = await fetch(`${supabaseUrl}/functions/v1/validate-store`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function createRunForStores(userId: string, storeIds: string[], overrides?: Partial<Settings>) {
  const settings = { ...getSettings(), ...(overrides || {}) };
  const { data: run, error: runErr } = await supabase
    .from('scrape_runs')
    .insert({
      user_id: userId,
      status: 'running',
      run_status: 'queued',
      started_at: new Date().toISOString(),
      total_stores: storeIds.length,
      completed_stores: 0,
      total_products: 0,
      total_price_changes: 0,
      error_count: 0,
      pages_visited: 0,
      settings: settings as any,
    } as any)
    .select('id')
    .single();

  if (runErr || !run) throw runErr || new Error('Failed to create scrape run');

  const runStoreRows = storeIds.map((storeId) => ({
    scrape_run_id: run.id,
    user_id: userId,
    store_id: storeId,
    status: 'queued',
    page_count: 0,
    product_count: 0,
    price_changes: 0,
    collections_completed: 0,
    collections_failed: 0,
    collections_skipped: 0,
    collections_total: 0,
  }));

  const { error: runStoreErr } = await supabase.from('scrape_run_stores').insert(runStoreRows as any);
  if (runStoreErr) throw runStoreErr;
  return { runId: run.id as string, settings };
}

function buildStorePatch(store: Store, validation: any) {
  return {
    normalized_url: validation.normalized_url,
    myshopify_domain: validation.myshopify_domain || null,
    platform: validation.platform || store.platform || 'unknown',
    platform_confidence: validation.platform_confidence || store.platform_confidence || null,
    scrape_strategy: validation.scrape_strategy || store.scrape_strategy,
    validation_status: validation.validation_status || store.validation_status,
    requires_auth: !!validation.requires_auth,
    auth_type: validation.auth_type || store.auth_type || 'none',
    scrapeability_score: validation.scrapeability_score || 0,
    reachability_status: validation.reachability_status || store.reachability_status || 'unknown',
    qualification_notes: Array.isArray(validation.qualification_notes)
      ? validation.qualification_notes.join('\n')
      : (validation.qualification_notes || store.qualification_notes || null),
    qualified_at: new Date().toISOString(),
    store_type: validation.store_type || store.store_type || 'unknown',
    antibot_suspected: !!validation.antibot_suspected,
    login_required: !!validation.login_required,
    sitemap_found: !!validation.sitemap_found,
    sitemap_url: validation.sitemap_url || null,
  } as any;
}

export function useRevalidateStores() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (stores: Store[]) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !user) throw new Error('Not authenticated');
      if (!stores.length) throw new Error('No stores selected');

      const results: Array<{ storeId: string; ok: boolean; message: string }> = [];
      for (const store of stores) {
        try {
          const validation = await validateStoreUrl(store.url, session.access_token);
          const patch = buildStorePatch(store, validation);
          const { error } = await supabase.from('stores').update(patch).eq('id', store.id).eq('user_id', user.id);
          if (error) throw error;
          results.push({ storeId: store.id, ok: true, message: validation.message || 'Validated' });
        } catch (e: any) {
          results.push({ storeId: store.id, ok: false, message: e.message || 'Validation failed' });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['store_diagnostics'] });
      const ok = results.filter(r => r.ok).length;
      const failed = results.length - ok;
      toast.success(`Revalidated ${ok} store${ok === 1 ? '' : 's'}${failed ? ` · ${failed} failed` : ''}`);
    },
    onError: (e: any) => toast.error(e.message || 'Failed to revalidate stores'),
  });
}

export function useScrapeStores() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ storeIds, overrides, modeLabel }: { storeIds: string[]; overrides?: Partial<Settings>; modeLabel?: string }) => {
      if (!user) throw new Error('Not authenticated');
      if (!storeIds.length) throw new Error('No stores selected');
      const { runId, settings } = await createRunForStores(user.id, storeIds, overrides);
      const results: Array<{ storeId: string; ok: boolean }> = [];
      for (const storeId of storeIds) {
        try {
          await scrapeStore(runId, storeId, settings);
          results.push({ storeId, ok: true });
        } catch {
          results.push({ storeId, ok: false });
        }
      }
      return { runId, results, modeLabel };
    },
    onSuccess: ({ results, runId, modeLabel }) => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['store_diagnostics'] });
      queryClient.invalidateQueries({ queryKey: ['scrape_runs'] });
      queryClient.invalidateQueries({ queryKey: ['scraper_events'] });
      const ok = results.filter(r => r.ok).length;
      const failed = results.length - ok;
      toast.success(`${modeLabel || 'Scrape run'} started (${runId.slice(0, 8)}…) · ${ok} succeeded${failed ? ` · ${failed} failed` : ''}`);
    },
    onError: (e: any) => toast.error(e.message || 'Failed to scrape stores'),
  });
}
