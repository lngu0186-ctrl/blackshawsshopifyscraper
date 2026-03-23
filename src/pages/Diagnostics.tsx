import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStores } from '@/hooks/useStores';
import { useAnalyzeFailure } from '@/hooks/useDiagnostics';
import { useScraperEvents, useScraperEventsSummary, useScraperEventStages } from '@/hooks/useScraperEvents';
import { useStoreDiagnostics } from '@/hooks/useStoreDiagnostics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle, ArrowUpDown, CheckCircle2, Clock, ExternalLink,
  Filter, Loader2, Search, ShieldAlert, Sparkles, Store as StoreIcon,
  Activity, XCircle, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    info: 'bg-primary/10 text-primary border-primary/30',
    warning: 'bg-warning/15 text-warning border-warning/30',
    error: 'bg-destructive/15 text-destructive border-destructive/30',
    critical: 'bg-destructive/30 text-destructive border-destructive/50 font-bold',
  };
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border', map[severity] ?? 'bg-muted text-muted-foreground')}>
      {severity.toUpperCase()}
    </span>
  );
}

function stageLabel(stage: string): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function riskTone(status?: string) {
  switch (status) {
    case 'blocked':
    case 'failing':
    case 'invalid':
      return 'bg-destructive/10 text-destructive border-destructive/30';
    case 'auth_required':
    case 'zero_products':
    case 'stale':
      return 'bg-warning/10 text-warning border-warning/30';
    case 'productive':
      return 'bg-success/10 text-success border-success/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function RiskIcon({ status }: { status?: string }) {
  switch (status) {
    case 'productive':
      return <CheckCircle2 className="w-3.5 h-3.5" />;
    case 'blocked':
      return <ShieldAlert className="w-3.5 h-3.5" />;
    case 'failing':
    case 'invalid':
      return <XCircle className="w-3.5 h-3.5" />;
    default:
      return <AlertTriangle className="w-3.5 h-3.5" />;
  }
}

function riskScore(row: any) {
  let score = 0;
  switch (row.status) {
    case 'blocked': score += 100; break;
    case 'failing': score += 90; break;
    case 'auth_required': score += 80; break;
    case 'zero_products': score += 70; break;
    case 'stale': score += 60; break;
    case 'invalid': score += 50; break;
    case 'never_scraped': score += 40; break;
    case 'unknown': score += 30; break;
    case 'productive': score += 5; break;
    case 'disabled': score += 0; break;
  }
  score += Math.min((row.failuresLast7Days ?? 0) * 6, 30);
  score += Math.min((row.warningsLast7Days ?? 0) * 2, 10);
  if ((row.products ?? 0) === 0 && row.status !== 'productive') score += 8;
  return score;
}

export default function Diagnostics() {
  const [searchParams] = useSearchParams();
  const [storeSearch, setStoreSearch] = useState('');
  const [eventSearch, setEventSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterStage, setFilterStage] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const [filterDate, setFilterDate] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [riskFilter, setRiskFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'risk' | 'errors' | 'products' | 'name'>('risk');
  const [page, setPage] = useState(1);
  const [runSummaryAnalysis, setRunSummaryAnalysis] = useState<Record<string, any> | null>(null);

  const analyzeFailure = useAnalyzeFailure();
  const { data: stores, isLoading: storesLoading } = useStores();

  useEffect(() => {
    const risk = searchParams.get('risk');
    const severity = searchParams.get('severity');
    const stage = searchParams.get('stage');
    const storeId = searchParams.get('store');
    const date = searchParams.get('date');
    if (risk) setRiskFilter(risk);
    if (severity) setFilterSeverity(severity);
    if (stage) setFilterStage(stage);
    if (storeId) setFilterStore(storeId);
    if (date && ['24h', '7d', '30d', 'all'].includes(date)) setFilterDate(date as any);
  }, [searchParams]);
  const { data: diagnostics, isLoading: diagnosticsLoading } = useStoreDiagnostics(stores);
  const { data: summary, isLoading: summaryLoading } = useScraperEventsSummary();
  const { data: stages } = useScraperEventStages();

  const { data: eventsData, isLoading: eventsLoading } = useScraperEvents({
    severity: filterSeverity !== 'all' ? filterSeverity : undefined,
    stage: filterStage !== 'all' ? filterStage : undefined,
    store_id: filterStore !== 'all' ? filterStore : undefined,
    dateRange: filterDate,
    search: eventSearch || undefined,
    page,
    pageSize: 50,
  });

  const events = eventsData?.data ?? [];
  const totalCount = eventsData?.count ?? 0;
  const totalPages = Math.ceil(totalCount / 50);

  const storeRows = useMemo(() => {
    const rows = (stores ?? []).map(store => {
      const d = diagnostics?.[store.id];
      return {
        ...store,
        ...d,
        status: d?.status ?? 'unknown',
        label: d?.label ?? 'Unknown',
        reason: d?.reason ?? 'No diagnostic summary yet',
        failuresLast7Days: d?.failuresLast7Days ?? 0,
        warningsLast7Days: d?.warningsLast7Days ?? 0,
        latestRunStatus: d?.latestRunStatus ?? null,
        latestRunAt: d?.latestRunAt ?? null,
        latestErrorMessage: d?.latestErrorMessage ?? null,
        lastSuccessfulRunAt: d?.lastSuccessfulRunAt ?? null,
        failuresSinceSuccess: d?.failuresSinceSuccess ?? 0,
        risk: riskScore({ ...store, ...d }),
      };
    });

    const searchLower = storeSearch.trim().toLowerCase();
    const filtered = rows.filter(row => {
      if (riskFilter !== 'all' && row.status !== riskFilter) return false;
      if (!searchLower) return true;
      return [row.name, row.normalized_url, row.reason, row.latestErrorMessage, row.label]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(searchLower));
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'errors') return (b.failuresLast7Days ?? 0) - (a.failuresLast7Days ?? 0) || b.risk - a.risk;
      if (sortBy === 'products') return (a.total_products ?? 0) - (b.total_products ?? 0) || b.risk - a.risk;
      return b.risk - a.risk || (b.failuresLast7Days ?? 0) - (a.failuresLast7Days ?? 0);
    });

    return sorted;
  }, [stores, diagnostics, riskFilter, sortBy, storeSearch]);

  const riskCounts = useMemo(() => {
    const rows = Object.values(diagnostics ?? {});
    return {
      urgent: rows.filter(r => ['blocked', 'failing', 'auth_required'].includes(r.status)).length,
      warning: rows.filter(r => ['zero_products', 'stale', 'never_scraped', 'invalid'].includes(r.status)).length,
      healthy: rows.filter(r => r.status === 'productive').length,
    };
  }, [diagnostics]);

  async function handleAISummary() {
    if (!summary) return;
    const res = await analyzeFailure.mutateAsync({
      run_summary: {
        total_events: summary.totalEvents,
        critical_errors: summary.criticalErrors,
        warnings: summary.warnings,
        failed_stages: summary.failedStages,
        urgent_stores: riskCounts.urgent,
      },
    });
    setRunSummaryAnalysis(res.analysis);
  }

  const isEmpty = !summaryLoading && summary?.totalEvents === 0 && !storesLoading;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="flex-shrink-0 border-b border-border px-6 py-3 flex items-center justify-between bg-card">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">Diagnostics</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Store-first risk queue with supporting scraper evidence underneath
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-2 text-[12px] h-8"
          onClick={handleAISummary}
          disabled={analyzeFailure.isPending || isEmpty}
        >
          {analyzeFailure.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-primary" />}
          AI Health Summary
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {isEmpty && (
            <div className="bg-card rounded-2xl border border-dashed border-border p-10 text-center">
              <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-[13px] font-semibold text-foreground mb-1">No diagnostics recorded yet</p>
              <p className="text-[12px] text-muted-foreground">Run a scrape to generate store risk signals and event evidence.</p>
            </div>
          )}

          {!isEmpty && (
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
              {[
                { label: 'Urgent Stores', value: riskCounts.urgent, icon: XCircle, color: 'text-destructive' },
                { label: 'At-Risk Stores', value: riskCounts.warning, icon: AlertTriangle, color: 'text-warning' },
                { label: 'Healthy Stores', value: riskCounts.healthy, icon: CheckCircle2, color: 'text-success' },
                { label: 'Critical Errors', value: summary?.criticalErrors ?? 0, icon: ShieldAlert, color: 'text-destructive' },
                { label: 'Warnings', value: summary?.warnings ?? 0, icon: BarChart3, color: 'text-warning' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-card rounded-2xl border border-border p-4 shadow-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn('w-4 h-4', color)} />
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                  </div>
                  {summaryLoading || diagnosticsLoading ? (
                    <Skeleton className="h-7 w-16" />
                  ) : (
                    <p className={cn('text-2xl font-bold tabular-nums', color)}>{value.toLocaleString()}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {runSummaryAnalysis && (
            <div className="bg-card rounded-2xl border border-primary/30 p-5 shadow-card">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <p className="text-[13px] font-semibold text-foreground">AI Health Summary</p>
              </div>
              {runSummaryAnalysis.summary && (
                <p className="text-[13px] text-foreground mb-3">{runSummaryAnalysis.summary}</p>
              )}
            </div>
          )}

          {!isEmpty && (
            <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
              <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={storeSearch}
                    onChange={e => setStoreSearch(e.target.value)}
                    placeholder="Search store name, URL, reason, issue…"
                    className="pl-9 h-8 text-[12px]"
                  />
                </div>

                <Select value={riskFilter} onValueChange={setRiskFilter}>
                  <SelectTrigger className="h-8 text-[11px] w-40">
                    <Filter className="w-3 h-3 mr-1" />
                    <SelectValue placeholder="Risk" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All risk states</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="failing">Failing</SelectItem>
                    <SelectItem value="auth_required">Auth required</SelectItem>
                    <SelectItem value="zero_products">Zero products</SelectItem>
                    <SelectItem value="stale">Stale</SelectItem>
                    <SelectItem value="never_scraped">Never scraped</SelectItem>
                    <SelectItem value="productive">Productive</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
                  <SelectTrigger className="h-8 text-[11px] w-36">
                    <ArrowUpDown className="w-3 h-3 mr-1" />
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="risk">Sort by risk</SelectItem>
                    <SelectItem value="errors">Sort by errors</SelectItem>
                    <SelectItem value="products">Sort by low products</SelectItem>
                    <SelectItem value="name">Sort by name</SelectItem>
                  </SelectContent>
                </Select>

                <p className="text-[11px] text-muted-foreground ml-auto">{storeRows.length.toLocaleString()} stores</p>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {['Risk', 'Store', 'Reason', 'Products', 'Errors 7d', 'Warnings 7d', 'Latest Run', 'Last Success', 'Failure Delta', 'Last Scraped', 'Actions'].map(h => (
                        <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(storesLoading || diagnosticsLoading) && Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 11 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-3 w-full" /></td>
                        ))}
                      </tr>
                    ))}

                    {!storesLoading && !diagnosticsLoading && storeRows.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground text-[12px]">
                          No stores match the current risk filters.
                        </td>
                      </tr>
                    )}

                    {storeRows.map(row => (
                      <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors align-top">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border', riskTone(row.status))}>
                            <RiskIcon status={row.status} />
                            {row.label}
                          </span>
                          <div className="text-[10px] text-muted-foreground mt-1">Score {row.risk}</div>
                        </td>
                        <td className="px-4 py-3 min-w-[220px]">
                          <div className="flex items-center gap-2">
                            <StoreIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{row.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{row.normalized_url}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 min-w-[280px]">
                          <p className="text-[11px] text-foreground">{row.reason}</p>
                          {row.latestErrorMessage && (
                            <p className="text-[10px] text-destructive mt-1 line-clamp-2">{row.latestErrorMessage}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold tabular-nums">{(row.total_products ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn('font-semibold tabular-nums', row.failuresLast7Days > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                            {row.failuresLast7Days}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn('font-semibold tabular-nums', row.warningsLast7Days > 0 ? 'text-warning' : 'text-muted-foreground')}>
                            {row.warningsLast7Days}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[11px]">
                          <div className="text-foreground">{row.latestRunStatus ?? '—'}</div>
                          <div className="text-[10px] text-muted-foreground">{row.latestRunAt ? new Date(row.latestRunAt).toLocaleString() : 'No run yet'}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[11px] text-muted-foreground">
                          {row.lastSuccessfulRunAt ? new Date(row.lastSuccessfulRunAt).toLocaleString() : 'No success yet'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[11px]">
                          <span className={cn('font-semibold tabular-nums', row.failuresSinceSuccess > 0 ? 'text-destructive' : 'text-success')}>
                            {row.failuresSinceSuccess > 0 ? `+${row.failuresSinceSuccess} failures` : 'Clean since success'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[11px] text-muted-foreground">
                          {row.last_scraped_at ? new Date(row.last_scraped_at).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Button asChild variant="outline" size="sm" className="h-7 text-[11px]">
                              <Link to={`/stores/${row.id}`}>Open</Link>
                            </Button>
                            <a href={row.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!isEmpty && (
            <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div>
                  <h2 className="text-[13px] font-semibold text-foreground">Event Evidence</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Raw scraper events supporting the store risk view</p>
                </div>
                <p className="text-[11px] text-muted-foreground">{totalCount.toLocaleString()} events</p>
              </div>

              <div className="flex items-center gap-3 p-4 border-b border-border flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={eventSearch}
                    onChange={e => { setEventSearch(e.target.value); setPage(1); }}
                    placeholder="Search event messages, URLs, stages…"
                    className="pl-9 h-8 text-[12px]"
                  />
                </div>
                <Select value={filterSeverity} onValueChange={v => { setFilterSeverity(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-[11px] w-32">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All severity</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filterStage} onValueChange={v => { setFilterStage(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-[11px] w-44">
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stages</SelectItem>
                    {(stages ?? []).map(s => (
                      <SelectItem key={s} value={s}>{stageLabel(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterStore} onValueChange={v => { setFilterStore(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-[11px] w-44">
                    <SelectValue placeholder="Store" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stores</SelectItem>
                    {(stores ?? []).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterDate} onValueChange={v => { setFilterDate(v as any); setPage(1); }}>
                  <SelectTrigger className="h-8 text-[11px] w-32">
                    <SelectValue placeholder="Date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="24h">Last 24h</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="overflow-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {['Timestamp', 'Store', 'Stage', 'Severity', 'URL', 'Message'].map(h => (
                        <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {eventsLoading && Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-3 w-full" /></td>)}
                      </tr>
                    ))}
                    {!eventsLoading && events.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-[12px]">No events match the current filters.</td>
                      </tr>
                    )}
                    {events.map(evt => (
                      <tr key={evt.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            <span className="text-[10px]">{new Date(evt.created_at).toLocaleString()}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-[11px] font-medium text-foreground">
                          {evt.store_id ? ((stores ?? []).find(s => s.id === evt.store_id)?.name ?? `${evt.store_id.slice(0, 8)}…`) : '—'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-[11px] text-foreground">{stageLabel(evt.stage)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap"><SeverityBadge severity={evt.severity} /></td>
                        <td className="px-4 py-2.5 max-w-[200px]">
                          {evt.url ? (
                            <a href={evt.url} target="_blank" rel="noopener noreferrer" className="truncate text-[10px] text-primary hover:underline flex items-center gap-1" title={evt.url}>
                              <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">{evt.url.replace(/^https?:\/\//, '').slice(0, 40)}{evt.url.length > 40 ? '…' : ''}</span>
                            </a>
                          ) : <span className="text-muted-foreground text-[10px]">—</span>}
                        </td>
                        <td className="px-4 py-2.5 max-w-[320px]">
                          <p className="truncate text-[11px] text-foreground" title={evt.message}>{evt.message || '—'}</p>
                          {evt.raw_error && <p className="truncate text-[10px] text-destructive mt-0.5" title={evt.raw_error}>{evt.raw_error.slice(0, 80)}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                  <p className="text-[11px] text-muted-foreground">Page {page} of {totalPages}</p>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>Next</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
