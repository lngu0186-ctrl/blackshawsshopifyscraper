import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useStores } from '@/hooks/useStores';
import { useScrapeRun } from '@/hooks/useScrapeRun';
import { useRunObservabilitySummary, useRunStoreBreakdown } from '@/hooks/useRunObservability';
import { useScrapeSource, useEnrichProducts, useCreateScrapeJob } from '@/hooks/useScrapedProducts';
import { usePipelineStats } from '@/hooks/usePipelineStats';
import { SITE_ADAPTERS } from '@/lib/siteAdapters';
import { Link } from 'react-router-dom';
import {
  Play, Square, RefreshCw, Download, Search,
  CheckCircle2, AlertTriangle, XCircle, Loader2,
  TrendingUp, TrendingDown, Package, Store,
  Zap, BarChart3, Eye, Image, FileText, Tag,
  Activity, Clock, ExternalLink, ChevronRight,
  Database, Layers, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ─── Animated count hook ──────────────────────────────────────────────────────
function useCountUp(target: number, duration = 600) {
  const [val, setVal] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    if (prev.current === target) return;
    const diff = target - prev.current;
    const start = prev.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const elapsed = now - t0;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(start + diff * ease));
      if (progress < 1) requestAnimationFrame(step);
      else prev.current = target;
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  icon: any;
  label: string;
  value: number;
  sub?: string;
  trend?: number;
  color?: string;
  loading?: boolean;
  pulse?: boolean;
}

function KpiCard({ icon: Icon, label, value, sub, trend, color = 'text-primary', loading, pulse }: KpiCardProps) {
  const animVal = useCountUp(value);
  const iconBg = color === 'text-success' ? 'bg-success/10' : color === 'text-warning' ? 'bg-warning/10' : color === 'text-destructive' ? 'bg-destructive/10' : 'bg-primary/8';
  return (
    <div className="bg-white rounded-2xl border border-border shadow-card p-4 hover:shadow-card-md transition-all duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
        {trend !== undefined && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${
            trend > 0 ? 'bg-success/10 text-success' : trend < 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
          }`}>
            {trend > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-6 w-16 mb-1" />
      ) : (
        <p className={`text-[22px] font-bold tabular-nums tracking-tight ${pulse ? 'animate-count-up' : ''}`}>
          {animVal.toLocaleString()}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    idle:      { label: 'Idle',      cls: 'bg-muted text-muted-foreground',          dot: 'bg-muted-foreground' },
    running:   { label: 'Running',   cls: 'bg-warning/15 text-warning',              dot: 'bg-warning animate-pulse' },
    completed: { label: 'Complete',  cls: 'bg-success/15 text-success',              dot: 'bg-success' },
    cancelled: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground',          dot: 'bg-muted-foreground' },
    failed:    { label: 'Failed',    cls: 'bg-destructive/15 text-destructive',      dot: 'bg-destructive' },
    queued:    { label: 'Queued',    cls: 'bg-primary/10 text-primary',             dot: 'bg-primary' },
    partial:   { label: 'Partial',   cls: 'bg-warning/15 text-warning',              dot: 'bg-warning' },
    enriched:  { label: 'Enriched',  cls: 'bg-success/15 text-success',              dot: 'bg-success' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ─── Pipeline Stage Row ───────────────────────────────────────────────────────
function PipelineRow({
  icon: Icon, label, done, total, success, warning, error, active, untracked,
}: {
  icon: any; label: string; done: number; total: number; success: number; warning: number; error: number; active?: boolean; untracked?: boolean;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-colors ${active ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-primary/15' : 'bg-muted'}`}>
        <Icon className={`w-3.5 h-3.5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className={`text-[12px] font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
          {untracked ? (
            <span className="text-[10px] text-muted-foreground italic">Not tracked</span>
          ) : (
            <span className="text-[11px] font-bold tabular-nums text-foreground">{done.toLocaleString()} <span className="text-muted-foreground font-normal">/ {total.toLocaleString()}</span></span>
          )}
        </div>
        {!untracked && <Progress value={pct} className="h-1.5" />}
      </div>
      <div className="flex items-center gap-2 text-[10px] flex-shrink-0">
        {success > 0 && <span className="text-success font-semibold">+{success}</span>}
        {warning > 0 && <span className="text-warning font-semibold">!{warning}</span>}
        {error > 0 && <span className="text-destructive font-semibold">✕{error}</span>}
      </div>
    </div>
  );
}

// ─── Source Card ──────────────────────────────────────────────────────────────
function SourceCard({ sourceKey, adapter, stats, onScrape, onEnrich, isScraping, isEnriching }: {
  sourceKey: string;
  adapter: any;
  stats?: { discovered: number; enriched: number; missingPrice: number; missingImage: number };
  onScrape: () => void;
  onEnrich: () => void;
  isScraping: boolean;
  isEnriching: boolean;
}) {
  const enrichPct = stats && stats.discovered > 0
    ? Math.round((stats.enriched / stats.discovered) * 100)
    : 0;

  return (
    <div className="bg-card rounded-2xl border border-border shadow-card p-4 hover:shadow-card-md transition-shadow duration-200 group">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[13px] font-semibold text-foreground">{adapter.sourceName}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{adapter.baseUrl.replace('https://', '')}</p>
        </div>
        <Badge variant="outline" className="text-[9px] font-semibold uppercase tracking-wide">
          {adapter.platform}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: 'Discovered', value: stats?.discovered ?? 0, color: 'text-foreground' },
          { label: 'Enriched',   value: stats?.enriched ?? 0,   color: 'text-success' },
          { label: 'No price',   value: stats?.missingPrice ?? 0, color: stats?.missingPrice ? 'text-warning' : 'text-muted-foreground' },
          { label: 'No image',   value: stats?.missingImage ?? 0, color: stats?.missingImage ? 'text-warning' : 'text-muted-foreground' },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <p className={`text-[15px] font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-muted-foreground">Enrichment</span>
          <span className="font-semibold text-foreground">{enrichPct}%</span>
        </div>
        <Progress value={enrichPct} className="h-1.5" />
      </div>

      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px] gap-1" onClick={onScrape} disabled={isScraping}>
          {isScraping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          Discover
        </Button>
        <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px] gap-1" onClick={onEnrich} disabled={isEnriching}>
          {isEnriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Enrich
        </Button>
      </div>
    </div>
  );
}

// ─── Activity Feed Row ────────────────────────────────────────────────────────
function ActivityRow({ log }: { log: any }) {
  const levelColor: Record<string, string> = {
    info:  'bg-primary/10 text-primary',
    warn:  'bg-warning/10 text-warning',
    error: 'bg-destructive/10 text-destructive',
  };
  const cls = levelColor[log.level] ?? levelColor.info;
  return (
    <div className="flex items-start gap-3 py-2 animate-slide-in-right">
      <span className={`mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${cls}`}>
        {log.level}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-foreground leading-snug">{log.message}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {new Date(log.created_at).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

// ─── Field Coverage Bar ───────────────────────────────────────────────────────
function CoverageBar({ label, covered, total, icon: Icon }: {
  label: string; covered: number; total: number; icon: any;
}) {
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  const color = pct >= 90 ? 'bg-success' : pct >= 60 ? 'bg-warning' : 'bg-destructive';
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-foreground">{label}</span>
          <span className="text-[11px] font-bold tabular-nums text-foreground">{pct}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground flex-shrink-0 w-14 text-right">
        {covered.toLocaleString()} / {total.toLocaleString()}
      </span>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const { data: stores, isLoading: storesLoading } = useStores();
  const queryClient = useQueryClient();
  const { status: scrapeStatus, runData, storeStatuses, logs, startRun, cancelRun, resetRun, isRunning } = useScrapeRun();
  const { summary: runObservability, runs: recentRuns } = useRunObservabilitySummary();
  const { data: latestRunStores } = useRunStoreBreakdown(runObservability.latestFinished?.id);
  const { data: pipeline, isLoading: pipelineLoading } = usePipelineStats();
  const [searchTerm, setSearchTerm] = useState('');
  const scrapeSource = useScrapeSource();
  const enrichMutation = useEnrichProducts();
  const createJob = useCreateScrapeJob();
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Scroll activity feed to bottom on new logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  // Price changes count (from Shopify store scraping pipeline — separate from scraped_products)
  const { data: priceChangesCount } = useQuery({
    queryKey: ['price_changes_count', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('variant_price_history')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('price_changed', true);
      return count ?? 0;
    },
  });

  // Per-source stats come from pipeline.bySource
  const sourceStats = Object.entries(SITE_ADAPTERS).reduce((acc, [key]) => {
    const s = pipeline?.bySource[key];
    acc[key] = {
      discovered: s?.discovered ?? 0,
      enriched: s?.enriched ?? 0,
      missingPrice: s?.missingPrice ?? 0,
      missingImage: s?.missingImage ?? 0,
    };
    return acc;
  }, {} as Record<string, any>);

  const enabledStores = stores?.filter(s => s.enabled) ?? [];
  const lastScraped = stores
    ?.filter(s => s.last_scraped_at)
    .sort((a, b) => new Date(b.last_scraped_at!).getTime() - new Date(a.last_scraped_at!).getTime())[0];

  // Scrape run progress
  const completedStores = runData?.completed_stores ?? 0;
  const totalStores = runData?.total_stores ?? 0;
  const runProgress = totalStores > 0 ? Math.round((completedStores / totalStores) * 100) : 0;

  // Use canonical pipeline stats everywhere
  const totalScraped   = pipeline?.discovered ?? 0;
  const readyCount     = pipeline?.readyCount ?? 0;
  const reviewCount    = pipeline?.reviewRequired ?? 0;

  async function handleStartScrape() {
    await startRun();
    queryClient.invalidateQueries({ queryKey: ['pipeline_stats'] });
  }

  async function handleScrapeSource(sourceKey: string) {
    const job = await createJob.mutateAsync({ source_key: sourceKey, job_type: 'full' });
    scrapeSource.mutate({ source_key: sourceKey, job_id: job.id });
  }

  async function handleEnrichSource(sourceKey: string) {
    enrichMutation.mutate({ source_key: sourceKey, limit: 50 });
  }

  // Pipeline stages — all counts from canonical products table (productsTableStats)
  const pts = pipeline?.productsTableStats;
  const ptTotal = pts?.productsDiscovered ?? 0;
  const pipelineStages = [
    { icon: Globe,        label: 'Sources Detected',       done: pts?.sourcesDetected ?? 0,      total: pts?.sourcesDetected ?? 0,   success: 0, warning: 0, error: 0,  active: false },
    { icon: Layers,       label: 'Categories Discovered',  done: pts?.categoriesDiscovered ?? 0,  total: pts?.categoriesDiscovered ?? 0, success: 0, warning: 0, error: 0, active: false },
    { icon: Package,      label: 'Products Discovered',    done: ptTotal,                          total: ptTotal,                     success: ptTotal, warning: 0, error: 0, active: false },
    { icon: Eye,          label: 'Detail Pages Enriched',  done: pts?.detailEnriched ?? 0,         total: ptTotal,                     success: pts?.detailEnriched ?? 0, warning: 0, error: 0, active: false },
    { icon: Tag,          label: 'Price Extracted',        done: pts?.pricesExtracted ?? 0,        total: ptTotal,                     success: 0, warning: ptTotal - (pts?.pricesExtracted ?? 0), error: 0, active: false },
    { icon: Image,        label: 'Images Extracted',       done: pts?.imagesExtracted ?? 0,        total: ptTotal,                     success: 0, warning: ptTotal - (pts?.imagesExtracted ?? 0), error: 0, active: false },
    { icon: FileText,     label: 'Descriptions Extracted', done: pts?.descriptionsExtracted ?? 0,  total: ptTotal,                     success: 0, warning: ptTotal - (pts?.descriptionsExtracted ?? 0), error: 0, active: false },
    { icon: CheckCircle2, label: 'Validation Complete',    done: pts?.validationComplete ?? 0,     total: ptTotal,                     success: pts?.exportReady ?? 0, warning: ptTotal - (pts?.validationComplete ?? 0), error: 0, active: false },
  ];

  const coverageFields = [
    { label: 'Price',       icon: Tag,      covered: totalScraped - (pipeline?.missingPrice ?? 0),       total: totalScraped },
    { label: 'Images',      icon: Image,    covered: totalScraped - (pipeline?.missingImage ?? 0),       total: totalScraped },
    { label: 'Description', icon: FileText, covered: totalScraped - (pipeline?.missingDescription ?? 0), total: totalScraped },
    { label: 'Barcode',     icon: Tag,      covered: totalScraped - (pipeline?.missingBarcode ?? 0),     total: totalScraped },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ── Top Bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border bg-white flex-shrink-0">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight text-foreground leading-none">Dashboard</h1>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">AU Pharmacy Scout — Operations Centre</p>
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search products…"
              className="pl-9 h-9 text-[12.5px] rounded-xl bg-background border-border"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill status={scrapeStatus === 'idle' ? 'idle' : scrapeStatus} />

          {scrapeStatus === 'idle' && (
            <Button size="sm" className="h-8 gap-1.5 text-[12px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold" onClick={handleStartScrape}>
              <Play className="w-3 h-3" /> Run All Stores
            </Button>
          )}
          {isRunning && (
            <Button size="sm" variant="destructive" className="h-8 gap-1.5 text-[12px] rounded-xl" onClick={cancelRun}>
              <Square className="w-3 h-3" /> Cancel
            </Button>
          )}
          {['completed', 'cancelled', 'failed'].includes(scrapeStatus) && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px] rounded-xl" onClick={resetRun}>
              <RefreshCw className="w-3 h-3" /> Reset
            </Button>
          )}

          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px] rounded-xl border-border" asChild>
            <Link to="/export">
              <Download className="w-3 h-3" /> Export
            </Link>
          </Button>

          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 cursor-pointer border border-border"
            style={{ background: 'hsl(222 47% 22% / 0.08)', color: 'hsl(222 47% 22%)' }}
          >
            {user?.email?.slice(0, 2).toUpperCase() ?? 'AU'}
          </div>
        </div>
      </div>

      {/* ── Main scrollable area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-[1440px] mx-auto">

          {/* ── KPI Cards — 7-cell pipeline breakdown ─────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
            <Link to="/products" className="block">
              <KpiCard icon={Database}      label="Discovered"        value={totalScraped}                       sub="total scraped"                              color="text-primary"     loading={pipelineLoading} />
            </Link>
            <Link to="/products?review_status=pending" className="block">
              <KpiCard icon={Loader2}       label="Queued"            value={pipeline?.queued ?? 0}              sub="awaiting enrichment"                        color="text-primary"     loading={pipelineLoading} />
            </Link>
            <Link to="/products" className="block">
              <KpiCard icon={Zap}           label="Enriched"          value={pipeline?.enriched ?? 0}            sub="detail fetched"                             color="text-success"     loading={pipelineLoading} />
            </Link>
            <Link to="/diagnostics?severity=error&date=7d" className="block">
              <KpiCard icon={XCircle}       label="Failed"            value={pipeline?.failed ?? 0}              sub="scrape failed"                              color="text-destructive" loading={pipelineLoading} />
            </Link>
            <Link to="/products?review_status=pending" className="block">
              <KpiCard icon={AlertTriangle} label="Review Required"   value={reviewCount}                        sub="60–89 confidence"                           color="text-warning"     loading={pipelineLoading} />
            </Link>
            <Link to="/diagnostics?risk=auth_required&date=7d" className="block">
              <KpiCard icon={Store}         label="Auth Blocked"      value={pipeline?.authBlocked ?? 0}         sub="login required"                             color="text-warning"     loading={pipelineLoading} />
            </Link>
            <Link to="/export" className="block">
              <KpiCard icon={CheckCircle2}  label="Export Ready"      value={pipeline?.exportReady ?? 0}         sub="≥90, price filled"                          color="text-success"     loading={pipelineLoading} />
            </Link>
          </div>

          {/* ── Running progress banner ──────────────────────────────────────── */}
          {isRunning && (
            <div className="bg-white border border-warning/25 rounded-2xl px-5 py-4 flex items-center gap-4 animate-fade-in shadow-card">
              <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 animate-spin text-warning" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-foreground">
                    Scraping {completedStores} / {totalStores} stores
                  </span>
                  <span className="text-[12px] font-bold text-warning tabular-nums">{runProgress}%</span>
                </div>
                <Progress value={runProgress} className="h-1.5" />
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
                  <span>{(runData?.pages_visited ?? 0).toLocaleString()} pages</span>
                  {runData?.active_store_name && <span>Active: <span className="text-foreground font-medium">{runData.active_store_name}</span></span>}
                  {runData?.latest_message && <span className="truncate max-w-xs">{runData.latest_message}</span>}
                </div>
              </div>
            </div>
          )}

          {/* ── Main 3-column layout ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            {/* ── Left: Pipeline + Coverage ─────────────────────────────────── */}
            <div className="xl:col-span-1 space-y-4">

              {/* Extraction Pipeline */}
              <div className="bg-white rounded-2xl border border-border shadow-card">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div>
                    <h2 className="text-[13.5px] font-bold text-foreground">Extraction Pipeline</h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5">All-time totals</p>
                  </div>
                  {isRunning && <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />}
                </div>
                <div className="p-3 space-y-0.5">
                  {pipelineStages.map(stage => (
                    <PipelineRow key={stage.label} {...stage} />
                  ))}
                </div>
              </div>

              {/* Field Coverage */}
              <div className="bg-white rounded-2xl border border-border shadow-card">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-[13.5px] font-bold text-foreground">Extraction Health</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Field coverage across all products</p>
                </div>
                <div className="p-5 space-y-3.5">
                  {coverageFields.map(f => (
                    <CoverageBar key={f.label} {...f} />
                  ))}
                  {totalScraped === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-4">No products scraped yet.</p>
                  )}
                </div>
              </div>

              {/* Export Readiness */}
              <div className="bg-white rounded-2xl border border-border shadow-card">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-[13.5px] font-bold text-foreground">Export Readiness</h2>
                </div>
                <div className="p-5 space-y-3">
                  {[
                    { label: 'Shopify Ready',   value: readyCount,   total: totalScraped, color: 'bg-success', icon: CheckCircle2, iconCls: 'text-success' },
                    { label: 'Review Required', value: reviewCount,  total: totalScraped, color: 'bg-warning', icon: AlertTriangle, iconCls: 'text-warning' },
                    { label: 'Partial / Raw',   value: pipeline?.partialRaw ?? 0, total: totalScraped, color: 'bg-destructive', icon: XCircle, iconCls: 'text-destructive' },
                  ].map(row => {
                    const pct = totalScraped > 0 ? Math.round((row.value / totalScraped) * 100) : 0;
                    return (
                      <div key={row.label} className="space-y-1.5">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-1.5 font-medium text-foreground">
                            <row.icon className={`w-3.5 h-3.5 ${row.iconCls}`} />
                            {row.label}
                          </span>
                          <span className="font-bold tabular-nums">{row.value.toLocaleString()} <span className="text-muted-foreground font-normal text-[11px]">({pct}%)</span></span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${row.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="flex-1 h-8 text-[12px] rounded-xl bg-foreground hover:bg-foreground/90 text-background font-semibold" asChild>
                      <Link to="/export">
                        <Download className="w-3 h-3 mr-1.5" /> Export CSV
                      </Link>
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-[12px] rounded-xl" asChild>
                      <Link to="/export">Review →</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Centre: Sources grid ──────────────────────────────────────── */}
            <div className="xl:col-span-1 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-foreground">Sources</h2>
                <Button size="sm" variant="ghost" className="h-6 text-[11px] text-muted-foreground gap-1" asChild>
                  <Link to="/export">See all <ChevronRight className="w-3 h-3" /></Link>
                </Button>
              </div>

              <div className="space-y-3">
                {Object.entries(SITE_ADAPTERS).map(([key, adapter]) => (
                  <SourceCard
                    key={key}
                    sourceKey={key}
                    adapter={adapter}
                    stats={sourceStats[key]}
                    onScrape={() => handleScrapeSource(key)}
                    onEnrich={() => handleEnrichSource(key)}
                    isScraping={scrapeSource.isPending}
                    isEnriching={enrichMutation.isPending}
                  />
                ))}
              </div>
            </div>

            {/* ── Right: Live feed + Store list ────────────────────────────── */}
            <div className="xl:col-span-1 space-y-4">

              {/* Live Activity Feed */}
              <div className="bg-card rounded-2xl border border-border shadow-card flex flex-col" style={{ maxHeight: '420px' }}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                  <div>
                    <h2 className="text-[13px] font-bold text-foreground">Live Activity</h2>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Real-time scraper events</p>
                  </div>
                  {isRunning && (
                    <span className="flex items-center gap-1.5 text-[10px] text-warning font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto px-4 divide-y divide-border/50">
                  {logs.length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-8">No activity yet. Start a scrape to see live events.</p>
                  )}
                  {logs.slice(-50).map((log, i) => (
                    <ActivityRow key={`${log.id ?? i}`} log={log} />
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>

              {/* Scrape Run: Per-Store Status */}
              {Object.keys(storeStatuses).length > 0 && (
                <div className="bg-card rounded-2xl border border-border shadow-card">
                  <div className="px-4 py-3 border-b border-border">
                    <h2 className="text-[13px] font-bold text-foreground">Store Progress</h2>
                  </div>
                  <div className="p-3 space-y-2">
                    {Object.values(storeStatuses).map((s: any) => {
                      const storeInfo = stores?.find(st => st.id === s.store_id);
                      return (
                        <div key={s.store_id} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-medium truncate">{storeInfo?.name ?? s.store_id.slice(0, 8)}</span>
                              <StatusPill status={s.status} />
                            </div>
                            {s.product_count > 0 && (
                              <p className="text-[10px] text-muted-foreground">{s.product_count} products · {s.page_count} pages</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Store Library quick view */}
              <div className="bg-card rounded-2xl border border-border shadow-card">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h2 className="text-[13px] font-bold text-foreground">Store Library</h2>
                  <span className="text-[10px] text-muted-foreground">{stores?.length ?? 0} total</span>
                </div>
                <div className="divide-y divide-border/50">
                  {storesLoading && [1,2,3].map(i => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3">
                      <Skeleton className="w-2 h-2 rounded-full" />
                      <Skeleton className="h-3 flex-1" />
                    </div>
                  ))}
                  {!storesLoading && stores?.slice(0, 8).map(store => (
                    <Link key={store.id} to={`/stores/${store.id}`}>
                      <div className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/50 transition-colors group">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          store.enabled ? 'bg-success' : 'bg-muted-foreground/30'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-foreground truncate group-hover:text-primary transition-colors">{store.name}</p>
                          <p className="text-[10px] text-muted-foreground">{store.total_products.toLocaleString()} products</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                            store.validation_status === 'valid' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                          }`}>
                            {store.validation_status}
                          </span>
                          <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    </Link>
                  ))}
                  {!storesLoading && (stores?.length ?? 0) === 0 && (
                    <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
                      No stores yet. Use "Seed starter library" in the sidebar.
                    </div>
                  )}
                  {(stores?.length ?? 0) > 8 && (
                    <div className="px-4 py-2 text-center">
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground" asChild>
                        <Link to="/stores">View all stores →</Link>
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Last run summary */}
              {(lastScraped || recentRuns.length > 0) && (
                <div className="bg-card rounded-2xl border border-border shadow-card px-4 py-3 space-y-2">
                  {lastScraped && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Last scraped: <span className="font-medium text-foreground">{lastScraped.name}</span></span>
                      <span className="ml-auto">{new Date(lastScraped.last_scraped_at!).toLocaleString()}</span>
                    </div>
                  )}
                  {runObservability.latestFinished && (
                    <div className="text-[11px] text-muted-foreground space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span>Latest run: <span className="text-foreground font-medium">{runObservability.latestFinished.run_status || runObservability.latestFinished.status}</span></span>
                        <span>{runObservability.latestFinished.finished_at ? new Date(runObservability.latestFinished.finished_at).toLocaleString() : 'In progress'}</span>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <span>{((runObservability.latestFinished as any).total_products ?? 0).toLocaleString()} products</span>
                        <span>{((runObservability.latestFinished as any).pages_visited ?? 0).toLocaleString()} pages</span>
                      </div>
                      {latestRunStores && latestRunStores.length > 0 && (
                        <div className="flex items-center gap-4 flex-wrap">
                          <span>
                            Store failures: <span className="text-foreground">{latestRunStores.filter((s: any) => s.status === 'error').length}</span>
                          </span>
                          <span>
                            Timeout fallout: <span className="text-foreground">{latestRunStores.filter((s: any) => String(s.terminal_status || s.message || '').toLowerCase().includes('parent run exceeded 3 hour timeout')).length}</span>
                          </span>
                          <span>
                            Collection failures: <span className="text-foreground">{latestRunStores.reduce((sum: number, s: any) => sum + (s.collections_failed ?? 0), 0)}</span>
                          </span>
                          <span>
                            Retry/fallback hints: <span className="text-foreground">{latestRunStores.filter((s: any) => String(s.terminal_status || s.message || '').toLowerCase().includes('retry')).length + latestRunStores.filter((s: any) => String(s.terminal_status || s.message || '').toLowerCase().includes('fallback')).length}</span>
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-4 flex-wrap">
                        <span>Completion rate: <span className="text-foreground">{runObservability.completionRate}%</span></span>
                        <span>Failure rate: <span className="text-foreground">{runObservability.failureRate}%</span></span>
                        <span>Timeout-affected runs: <span className="text-foreground">{runObservability.timeoutAffectedRuns}</span></span>
                        <span>Avg pages/run: <span className="text-foreground">{runObservability.avgPagesVisited}</span></span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
