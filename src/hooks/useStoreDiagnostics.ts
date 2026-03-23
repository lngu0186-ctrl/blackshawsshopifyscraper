import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import type { Store } from '@/types/schemas';

export type StoreDiagnosticStatus =
  | 'disabled'
  | 'invalid'
  | 'auth_required'
  | 'blocked'
  | 'never_scraped'
  | 'zero_products'
  | 'failing'
  | 'stale'
  | 'productive'
  | 'unknown';

export interface StoreDiagnosticSummary {
  storeId: string;
  status: StoreDiagnosticStatus;
  label: string;
  reason: string;
  failuresLast7Days: number;
  warningsLast7Days: number;
  latestRunStatus: string | null;
  latestRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  failuresSinceSuccess: number;
  latestErrorMessage: string | null;
  lastEventAt: string | null;
  products: number;
}

function daysSince(iso?: string | null) {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function deriveStatus(store: Store, extra: Omit<StoreDiagnosticSummary, 'storeId' | 'status' | 'label' | 'reason' | 'products'>): Pick<StoreDiagnosticSummary, 'status' | 'label' | 'reason'> {
  const validationStatus = store.validation_status;
  const authStatus = (store as any).auth_status ?? 'none';
  const antibotSuspected = Boolean((store as any).antibot_suspected);
  const productCount = store.total_products ?? 0;
  const scrapedDaysAgo = daysSince(store.last_scraped_at);

  if (!store.enabled) {
    return { status: 'disabled', label: 'Disabled', reason: 'Store is turned off' };
  }

  if (validationStatus === 'invalid') {
    return { status: 'invalid', label: 'Invalid', reason: 'Validation failed' };
  }

  if (store.requires_auth && authStatus !== 'authenticated') {
    return { status: 'auth_required', label: 'Auth required', reason: 'Needs working authentication before scraping' };
  }

  if (antibotSuspected || validationStatus === 'restricted' || extra.latestErrorMessage?.toLowerCase().includes('blocked')) {
    return { status: 'blocked', label: 'Blocked', reason: 'Anti-bot, access restriction, or blocking suspected' };
  }

  if (!store.last_scraped_at) {
    return { status: 'never_scraped', label: 'Never scraped', reason: 'No scrape has completed yet' };
  }

  if (extra.latestRunStatus === 'error' || extra.failuresLast7Days >= 3) {
    return { status: 'failing', label: 'Failing', reason: extra.latestErrorMessage ?? 'Recent scrape errors need attention' };
  }

  if (productCount === 0) {
    return { status: 'zero_products', label: 'Zero products', reason: 'Scrapes ran but no usable products were captured' };
  }

  if (scrapedDaysAgo > 14) {
    return { status: 'stale', label: 'Stale', reason: 'No recent successful scrape in the last 14 days' };
  }

  if (productCount > 0 && extra.failuresLast7Days <= 1) {
    return { status: 'productive', label: 'Productive', reason: 'Recent scrape activity is producing products' };
  }

  return { status: 'unknown', label: 'Unknown', reason: 'Not enough signals yet' };
}

export function useStoreDiagnostics(stores?: Store[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['store_diagnostics', user?.id, (stores ?? []).map(s => s.id).join(',')],
    enabled: !!user && !!stores?.length,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, StoreDiagnosticSummary>> => {
      const storeIds = (stores ?? []).map(s => s.id);
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [runStoresRes, eventsRes] = await Promise.all([
        supabase
          .from('scrape_run_stores')
          .select('store_id,status,message,updated_at,finished_at,started_at')
          .eq('user_id', user!.id)
          .in('store_id', storeIds)
          .order('updated_at', { ascending: false })
          .limit(2000),
        supabase
          .from('scraper_events')
          .select('store_id,severity,message,created_at,reason_code')
          .eq('user_id', user!.id)
          .in('store_id', storeIds)
          .gte('created_at', since7d)
          .order('created_at', { ascending: false })
          .limit(1000),
      ]);

      if (runStoresRes.error) throw runStoresRes.error;
      if (eventsRes.error) throw eventsRes.error;

      const latestRunByStore = new Map<string, any>();
      const lastSuccessfulRunByStore = new Map<string, any>();
      const failuresSinceSuccessByStore = new Map<string, number>();

      for (const row of runStoresRes.data ?? []) {
        if (!row.store_id) continue;
        if (!latestRunByStore.has(row.store_id)) {
          latestRunByStore.set(row.store_id, row);
        }
        if (row.status === 'completed' && !lastSuccessfulRunByStore.has(row.store_id)) {
          lastSuccessfulRunByStore.set(row.store_id, row);
        }
      }

      for (const row of runStoresRes.data ?? []) {
        if (!row.store_id) continue;
        const lastSuccess = lastSuccessfulRunByStore.get(row.store_id);
        const rowTime = row.finished_at ?? row.updated_at ?? row.started_at;
        const lastSuccessTime = lastSuccess?.finished_at ?? lastSuccess?.updated_at ?? lastSuccess?.started_at;
        const happenedAfterLastSuccess = !lastSuccessTime || (rowTime && new Date(rowTime).getTime() > new Date(lastSuccessTime).getTime());
        if (happenedAfterLastSuccess && row.status === 'error') {
          failuresSinceSuccessByStore.set(row.store_id, (failuresSinceSuccessByStore.get(row.store_id) ?? 0) + 1);
        }
      }

      const eventStats = new Map<string, {
        failures: number;
        warnings: number;
        latestErrorMessage: string | null;
        lastEventAt: string | null;
      }>();

      for (const event of eventsRes.data ?? []) {
        if (!event.store_id) continue;
        const current = eventStats.get(event.store_id) ?? {
          failures: 0,
          warnings: 0,
          latestErrorMessage: null,
          lastEventAt: null,
        };

        if (!current.lastEventAt) current.lastEventAt = event.created_at;
        if (event.severity === 'error' || event.severity === 'critical') {
          current.failures += 1;
          if (!current.latestErrorMessage) {
            current.latestErrorMessage = event.reason_code || event.message;
          }
        }
        if (event.severity === 'warning') {
          current.warnings += 1;
        }
        eventStats.set(event.store_id, current);
      }

      const out: Record<string, StoreDiagnosticSummary> = {};
      for (const store of stores ?? []) {
        const latestRun = latestRunByStore.get(store.id);
        const stats = eventStats.get(store.id) ?? {
          failures: 0,
          warnings: 0,
          latestErrorMessage: null,
          lastEventAt: null,
        };

        const lastSuccess = lastSuccessfulRunByStore.get(store.id);
        const base = {
          failuresLast7Days: stats.failures,
          warningsLast7Days: stats.warnings,
          latestRunStatus: latestRun?.status ?? null,
          latestRunAt: latestRun?.finished_at ?? latestRun?.updated_at ?? latestRun?.started_at ?? null,
          lastSuccessfulRunAt: lastSuccess?.finished_at ?? lastSuccess?.updated_at ?? lastSuccess?.started_at ?? null,
          failuresSinceSuccess: failuresSinceSuccessByStore.get(store.id) ?? 0,
          latestErrorMessage: latestRun?.message ?? stats.latestErrorMessage,
          lastEventAt: stats.lastEventAt,
        };

        const derived = deriveStatus(store, base);

        out[store.id] = {
          storeId: store.id,
          products: store.total_products ?? 0,
          ...base,
          ...derived,
        };
      }

      return out;
    },
  });
}
