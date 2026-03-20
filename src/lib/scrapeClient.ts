import { supabase } from './supabase';
import type { Settings } from '@/types/schemas';

export interface ScrapeJobState {
  runId: string;
  storeStatuses: Record<string, string>;
  cancelled: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  interPageDelay: 500,
  maxConcurrentStores: 3,
  maxProductsPerStore: 0,
  defaultExportScope: 'all',
  googleShoppingCondition: false,
};

export function getSettings(): Settings {
  try {
    const stored = localStorage.getItem('scraper_settings');
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: Partial<Settings>) {
  const current = getSettings();
  localStorage.setItem('scraper_settings', JSON.stringify({ ...current, ...s }));
}

export async function startScrapeRun(userId: string): Promise<{ runId: string; storeIds: string[] } | null> {
  const settings = getSettings();

  // Get enabled stores
  const { data: stores, error } = await supabase
    .from('stores')
    .select('id')
    .eq('user_id', userId)
    .eq('enabled', true);

  if (error || !stores || stores.length === 0) return null;

  // Create scrape run
  const { data: run, error: runErr } = await supabase
    .from('scrape_runs')
    .insert({
      user_id: userId,
      status: 'running',
      started_at: new Date().toISOString(),
      total_stores: stores.length,
      settings,
    })
    .select('id')
    .single();

  if (runErr || !run) return null;

  // Create scrape_run_stores rows
  const runStoreRows = stores.map((s) => ({
    scrape_run_id: run.id,
    user_id: userId,
    store_id: s.id,
    status: 'queued',
  }));

  await supabase.from('scrape_run_stores').insert(runStoreRows);

  return { runId: run.id, storeIds: stores.map((s) => s.id) };
}

export async function scrapeStore(
  runId: string,
  storeId: string,
  settings: Settings,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/scrape-store`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      scrapeRunId: runId,
      storeId,
      interPageDelay: settings.interPageDelay,
      maxProducts: settings.maxProductsPerStore,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`scrape-store failed: ${err}`);
  }
}

export async function cancelScrapeRun(runId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  await fetch(`${supabaseUrl}/functions/v1/cancel-scrape`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ scrapeRunId: runId }),
  });
}

export async function runConcurrentScrape(
  runId: string,
  storeIds: string[],
  settings: Settings,
  onStoreStart?: (storeId: string) => void,
  onStoreComplete?: (storeId: string, success: boolean) => void,
  isCancelled?: () => boolean,
): Promise<void> {
  const queue = [...storeIds];
  const maxConcurrent = Math.min(settings.maxConcurrentStores, 5);
  const running: Promise<void>[] = [];

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      if (isCancelled?.()) break;
      const storeId = queue.shift()!;
      onStoreStart?.(storeId);
      try {
        await scrapeStore(runId, storeId, settings);
        onStoreComplete?.(storeId, true);
      } catch {
        onStoreComplete?.(storeId, false);
      }
    }
  }

  for (let i = 0; i < maxConcurrent; i++) {
    running.push(processNext());
  }

  await Promise.all(running);

  if (!isCancelled?.()) {
    // Check if all stores completed/errored, then mark run completed
    const { data: runStores } = await supabase
      .from('scrape_run_stores')
      .select('status')
      .eq('scrape_run_id', runId);

    const allDone = runStores?.every(s => ['completed', 'error', 'cancelled'].includes(s.status));
    if (allDone) {
      await supabase
        .from('scrape_runs')
        .update({ status: 'completed', finished_at: new Date().toISOString() })
        .eq('id', runId);
    }
  }
}
