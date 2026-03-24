import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { startScrapeRun, runConcurrentScrape, cancelScrapeRun, getSettings } from '@/lib/scrapeClient';
import type { ScrapeRun, ScrapeRunStore, ScrapeLog } from '@/types/schemas';

export type RunStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';

// How long before stall warnings (ms)
const STALL_WARN_MS  = 45_000;
const STALL_CRIT_MS  = 90_000;

export function useScrapeRun() {
  const { user } = useAuth();
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [runData, setRunData] = useState<ScrapeRun | null>(null);
  const [storeStatuses, setStoreStatuses] = useState<Record<string, ScrapeRunStore>>({});
  const [logs, setLogs] = useState<ScrapeLog[]>([]);
  // Stall detection
  const [stallLevel, setStallLevel] = useState<'none' | 'warn' | 'critical'>('none');
  const lastEventTimeRef = useRef<number>(Date.now());
  const stallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
      // last_event_at is not in the current DB schema; stall detection relies on log polling
      if (['completed', 'cancelled', 'failed'].includes(runRes.data.status)) {
        setStatus(runRes.data.status as RunStatus);
        stopStallTimer();
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      }
    }
    if (storesRes.data) {
      const map: Record<string, ScrapeRunStore> = {};
      (storesRes.data as ScrapeRunStore[]).forEach(s => { map[s.store_id] = s; });
      setStoreStatuses(map);
    }
    if (logsRes.data) {
      setLogs((logsRes.data as ScrapeLog[]).reverse());
      // Reset stall timer whenever new logs arrive
      lastEventTimeRef.current = Date.now();
      setStallLevel('none');
    }
  }, []);

  function startStallTimer() {
    stopStallTimer();
    lastEventTimeRef.current = Date.now();
    stallTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastEventTimeRef.current;
      if (elapsed >= STALL_CRIT_MS) setStallLevel('critical');
      else if (elapsed >= STALL_WARN_MS) setStallLevel('warn');
      else setStallLevel('none');
    }, 5_000);
  }
  function stopStallTimer() {
    if (stallTimerRef.current) { clearInterval(stallTimerRef.current); stallTimerRef.current = null; }
    setStallLevel('none');
  }

  // Reset stall when real-time events fire
  const resetStall = useCallback(() => {
    lastEventTimeRef.current = Date.now();
    setStallLevel('none');
  }, []);

  useEffect(() => {
    if (!runId) return;
    const channel = supabase
      .channel(`scrape_run_${runId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scrape_run_stores', filter: `scrape_run_id=eq.${runId}` }, () => { pollData(runId); resetStall(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scrape_runs', filter: `id=eq.${runId}` }, () => { pollData(runId); resetStall(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scrape_logs', filter: `scrape_run_id=eq.${runId}` }, () => { pollData(runId); resetStall(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scraper_events', filter: `run_id=eq.${runId}` }, () => { pollData(runId); resetStall(); })
      .subscribe();
    pollingRef.current = setInterval(() => pollData(runId), 3000);
    return () => { supabase.removeChannel(channel); if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [runId, pollData, resetStall]);

  const startRun = useCallback(async () => {
    if (!user) return;
    cancelledRef.current = false;
    setStatus('running');
    setLogs([]);
    setStoreStatuses({});
    setRunData(null);
    startStallTimer();

    const result = await startScrapeRun(user.id);
    if (!result) { setStatus('idle'); stopStallTimer(); return; }

    setRunId(result.runId);
    await pollData(result.runId);

    const settings = getSettings();
    // Sequential: maxConcurrentStores = 1
    await runConcurrentScrape(
      result.runId, result.storeIds,
      { ...settings, maxConcurrentStores: 1 },
      undefined, undefined,
      () => cancelledRef.current,
    );
    await pollData(result.runId);
    stopStallTimer();
  }, [user, pollData]);

  const cancelRun = useCallback(async () => {
    if (!runId) return;
    cancelledRef.current = true;
    await cancelScrapeRun(runId);
    setStatus('cancelled');
    stopStallTimer();
    if (pollingRef.current) clearInterval(pollingRef.current);
  }, [runId]);

  const skipCurrentCollection = useCallback(async () => {
    if (!runId) return;
    // Find the currently-fetching store_id
    const fetching = Object.values(storeStatuses).find(s => s.status === 'fetching');
    if (!fetching) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    resetStall(); // operator action — reset stall
    await fetch(`${supabaseUrl}/functions/v1/skip-collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ scrapeRunId: runId, storeId: fetching.store_id }),
    });
  }, [runId, storeStatuses, resetStall]);

  const resetRun = useCallback(() => {
    setRunId(null); setStatus('idle'); setRunData(null); setStoreStatuses({});
    setLogs([]); cancelledRef.current = false; stopStallTimer();
  }, []);

  return {
    runId, status, runData, storeStatuses, logs,
    stallLevel, lastEventTime: lastEventTimeRef,
    startRun, cancelRun, skipCurrentCollection, resetRun,
    isRunning: status === 'running',
  };
}

export function useRecentScrapeRuns() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<ScrapeRun[]>([]);
  useEffect(() => {
    if (!user) return;
    supabase.from('scrape_runs').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setRuns((data as ScrapeRun[]) ?? []));
  }, [user]);
  return runs;
}
