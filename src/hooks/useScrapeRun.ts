import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { startScrapeRun, runConcurrentScrape, cancelScrapeRun, getSettings } from '@/lib/scrapeClient';
import type { ScrapeRun, ScrapeRunStore, ScrapeLog } from '@/types/schemas';

export type RunStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';

export function useScrapeRun() {
  const { user } = useAuth();
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [runData, setRunData] = useState<ScrapeRun | null>(null);
  const [storeStatuses, setStoreStatuses] = useState<Record<string, ScrapeRunStore>>({});
  const [logs, setLogs] = useState<ScrapeLog[]>([]);
  const cancelledRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollData = useCallback(async (rid: string) => {
    const [runRes, storesRes, logsRes] = await Promise.all([
      supabase.from('scrape_runs').select('*').eq('id', rid).single(),
      supabase.from('scrape_run_stores').select('*').eq('scrape_run_id', rid),
      supabase.from('scrape_logs').select('*').eq('scrape_run_id', rid).order('created_at', { ascending: false }).limit(100),
    ]);

    if (runRes.data) {
      setRunData(runRes.data as ScrapeRun);
      if (['completed', 'cancelled', 'failed'].includes(runRes.data.status)) {
        setStatus(runRes.data.status as RunStatus);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    }

    if (storesRes.data) {
      const map: Record<string, ScrapeRunStore> = {};
      (storesRes.data as ScrapeRunStore[]).forEach(s => { map[s.store_id] = s; });
      setStoreStatuses(map);
    }

    if (logsRes.data) {
      setLogs((logsRes.data as ScrapeLog[]).reverse());
    }
  }, []);

  useEffect(() => {
    if (!runId) return;

    // Try realtime subscription
    const channel = supabase
      .channel(`scrape_run_${runId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'scrape_run_stores',
        filter: `scrape_run_id=eq.${runId}`,
      }, () => pollData(runId))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'scrape_runs',
        filter: `id=eq.${runId}`,
      }, () => pollData(runId))
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'scrape_logs',
        filter: `scrape_run_id=eq.${runId}`,
      }, () => pollData(runId))
      .subscribe();

    // Fallback polling
    pollingRef.current = setInterval(() => pollData(runId), 2000);

    return () => {
      supabase.removeChannel(channel);
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [runId, pollData]);

  const startRun = useCallback(async () => {
    if (!user) return;
    cancelledRef.current = false;
    setStatus('running');
    setLogs([]);
    setStoreStatuses({});
    setRunData(null);

    const result = await startScrapeRun(user.id);
    if (!result) {
      setStatus('idle');
      return;
    }

    setRunId(result.runId);
    await pollData(result.runId);

    const settings = getSettings();
    await runConcurrentScrape(
      result.runId,
      result.storeIds,
      settings,
      undefined,
      undefined,
      () => cancelledRef.current,
    );

    await pollData(result.runId);
  }, [user, pollData]);

  const cancelRun = useCallback(async () => {
    if (!runId) return;
    cancelledRef.current = true;
    await cancelScrapeRun(runId);
    setStatus('cancelled');
    if (pollingRef.current) clearInterval(pollingRef.current);
  }, [runId]);

  const resetRun = useCallback(() => {
    setRunId(null);
    setStatus('idle');
    setRunData(null);
    setStoreStatuses({});
    setLogs([]);
    cancelledRef.current = false;
  }, []);

  return {
    runId, status, runData, storeStatuses, logs,
    startRun, cancelRun, resetRun,
    isRunning: status === 'running',
  };
}

export function useRecentScrapeRuns() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<ScrapeRun[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('scrape_runs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setRuns((data as ScrapeRun[]) ?? []));
  }, [user]);

  return runs;
}
