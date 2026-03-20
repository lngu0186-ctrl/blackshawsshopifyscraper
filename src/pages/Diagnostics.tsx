/**
 * Diagnostics page — wired to scraper_events table for live event data.
 * Block 4: Real event counts, event log table, severity/stage/store/date filters.
 */
import { useState } from 'react';
import { useStores } from '@/hooks/useStores';
import { useAnalyzeFailure } from '@/hooks/useDiagnostics';
import { useScraperEvents, useScraperEventsSummary, useScraperEventStages } from '@/hooks/useScraperEvents';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle, XCircle, CheckCircle2, Search,
  Loader2, ExternalLink, Sparkles,
  Activity, Clock, Filter, Database, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Severity badge ─────────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    info:     'bg-primary/10 text-primary border-primary/30',
    warning:  'bg-warning/15 text-warning border-warning/30',
    error:    'bg-destructive/15 text-destructive border-destructive/30',
    critical: 'bg-destructive/30 text-destructive border-destructive/50 font-bold',
  };
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border', map[severity] ?? 'bg-muted text-muted-foreground')}>
      {severity.toUpperCase()}
    </span>
  );
}

// ── Stage label prettifier ─────────────────────────────────────────────────────
function stageLabel(stage: string): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Diagnostics() {
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterStage, setFilterStage] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const [filterDate, setFilterDate] = useState<'24h' | '7d' | '30d' | 'all'>('all');
  const [page, setPage] = useState(1);
  const [runSummaryAnalysis, setRunSummaryAnalysis] = useState<Record<string, any> | null>(null);

  const analyzeFailure = useAnalyzeFailure();
  const { data: stores } = useStores();
  const { data: summary, isLoading: summaryLoading } = useScraperEventsSummary();
  const { data: stages } = useScraperEventStages();

  const { data: eventsData, isLoading: eventsLoading } = useScraperEvents({
    severity: filterSeverity !== 'all' ? filterSeverity : undefined,
    stage: filterStage !== 'all' ? filterStage : undefined,
    store_id: filterStore !== 'all' ? filterStore : undefined,
    dateRange: filterDate,
    search: search || undefined,
    page,
    pageSize: 100,
  });

  const events = eventsData?.data ?? [];
  const totalCount = eventsData?.count ?? 0;
  const totalPages = Math.ceil(totalCount / 100);

  const storeNameMap = Object.fromEntries((stores ?? []).map(s => [s.id, s.name]));

  async function handleAISummary() {
    if (!summary) return;
    const res = await analyzeFailure.mutateAsync({
      run_summary: {
        total_events: summary.totalEvents,
        critical_errors: summary.criticalErrors,
        warnings: summary.warnings,
        failed_stages: summary.failedStages,
      },
    });
    setRunSummaryAnalysis(res.analysis);
  }

  const isEmpty = !summaryLoading && summary?.totalEvents === 0;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-border px-6 py-3 flex items-center justify-between bg-card">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">Diagnostics</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Live pipeline event log — scraper lifecycle tracking
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

          {/* Empty state */}
          {isEmpty && (
            <div className="bg-card rounded-2xl border border-dashed border-border p-10 text-center">
              <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-[13px] font-semibold text-foreground mb-1">No events recorded yet</p>
              <p className="text-[12px] text-muted-foreground">Run a scrape to generate diagnostic data. Events will appear here as the pipeline executes.</p>
            </div>
          )}

          {/* KPI row */}
          {!isEmpty && (
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Events',   value: summary?.totalEvents ?? 0,   icon: Activity,       color: 'text-foreground' },
                { label: 'Critical Errors', value: summary?.criticalErrors ?? 0, icon: XCircle,        color: 'text-destructive' },
                { label: 'Warnings',        value: summary?.warnings ?? 0,        icon: AlertTriangle,  color: 'text-warning' },
                { label: 'Failed Stages',   value: summary?.failedStages ?? 0,    icon: BarChart3,      color: 'text-primary' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-card rounded-2xl border border-border p-4 shadow-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn('w-4 h-4', color)} />
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                  </div>
                  {summaryLoading ? (
                    <Skeleton className="h-7 w-16" />
                  ) : (
                    <p className={cn('text-2xl font-bold tabular-nums', color)}>{value.toLocaleString()}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* AI summary result */}
          {runSummaryAnalysis && (
            <div className="bg-card rounded-2xl border border-primary/30 p-5 shadow-card">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <p className="text-[13px] font-semibold text-foreground">AI Health Summary</p>
              </div>
              {runSummaryAnalysis.summary && (
                <p className="text-[13px] text-foreground mb-3">{runSummaryAnalysis.summary}</p>
              )}
              <div className="grid grid-cols-2 gap-3 mb-3">
                {runSummaryAnalysis.performing_well?.length > 0 && (
                  <div className="bg-success/10 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-semibold text-success mb-1">Performing Well</p>
                    {(runSummaryAnalysis.performing_well as string[]).map((s: string) => (
                      <p key={s} className="text-[11px] text-foreground">• {s}</p>
                    ))}
                  </div>
                )}
                {runSummaryAnalysis.failing_badly?.length > 0 && (
                  <div className="bg-destructive/10 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-semibold text-destructive mb-1">Failing Badly</p>
                    {(runSummaryAnalysis.failing_badly as string[]).map((s: string) => (
                      <p key={s} className="text-[11px] text-foreground">• {s}</p>
                    ))}
                  </div>
                )}
              </div>
              {runSummaryAnalysis.top_recommendations?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground">Top Recommendations</p>
                  {(runSummaryAnalysis.top_recommendations as any[]).map((r: any, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <Badge variant="outline" className={cn('text-[9px] shrink-0 mt-0.5',
                        r.priority === 'high' ? 'text-destructive border-destructive/40' :
                        r.priority === 'medium' ? 'text-warning border-warning/40' : ''
                      )}>
                        {r.priority}
                      </Badge>
                      <div>
                        <p className="text-[12px] font-medium text-foreground">{r.action}</p>
                        <p className="text-[10px] text-muted-foreground">{r.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Event log table */}
          {!isEmpty && (
            <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
              {/* Filter bar */}
              <div className="flex items-center gap-3 p-4 border-b border-border flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Search messages, URLs, stages…"
                    className="pl-9 h-8 text-[12px]"
                  />
                </div>

                {/* Severity */}
                <Select value={filterSeverity} onValueChange={v => { setFilterSeverity(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-[11px] w-32">
                    <Filter className="w-3 h-3 mr-1" />
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

                {/* Stage */}
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

                {/* Store */}
                <Select value={filterStore} onValueChange={v => { setFilterStore(v); setPage(1); }}>
                  <SelectTrigger className="h-8 text-[11px] w-40">
                    <SelectValue placeholder="Store" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stores</SelectItem>
                    {(stores ?? []).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Date range */}
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

                <p className="text-[11px] text-muted-foreground ml-auto shrink-0">
                  {totalCount.toLocaleString()} events
                </p>
              </div>

              {/* Table */}
              <div className="overflow-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {['Timestamp', 'Store', 'Stage', 'Severity', 'URL', 'Message'].map(h => (
                        <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {eventsLoading && Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-3 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!eventsLoading && events.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-[12px]">
                          No events match the current filters.
                        </td>
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
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="font-medium text-foreground text-[11px]">
                            {evt.store_id ? (storeNameMap[evt.store_id] ?? evt.store_id.slice(0, 8) + '…') : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-[11px] text-foreground">{stageLabel(evt.stage)}</span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <SeverityBadge severity={evt.severity} />
                        </td>
                        <td className="px-4 py-2.5 max-w-[200px]">
                          {evt.url ? (
                            <a
                              href={evt.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate text-[10px] text-primary hover:underline flex items-center gap-1"
                              title={evt.url}
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">{evt.url.replace(/^https?:\/\//, '').slice(0, 40)}{evt.url.length > 40 ? '…' : ''}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 max-w-[320px]">
                          <p className="truncate text-[11px] text-foreground" title={evt.message}>{evt.message || '—'}</p>
                          {evt.raw_error && (
                            <p className="truncate text-[10px] text-destructive mt-0.5" title={evt.raw_error}>{evt.raw_error.slice(0, 80)}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    Previous
                  </Button>
                  <p className="text-[11px] text-muted-foreground">Page {page} of {totalPages}</p>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
