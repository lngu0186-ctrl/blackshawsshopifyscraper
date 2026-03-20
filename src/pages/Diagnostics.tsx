import { useState } from 'react';
import { useStores, useUpdateStore } from '@/hooks/useStores';
import { useDiagnostics, useDiagnosticsSummary, useAnalyzeFailure } from '@/hooks/useDiagnostics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertTriangle, XCircle, CheckCircle2, Search, RefreshCw,
  Loader2, ExternalLink, Sparkles, ChevronRight, Info,
  Zap, Globe, Database, Tag, Image, FileText, BarChart3,
  Clock, Activity, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScrapeDiagnostic } from '@/hooks/useDiagnostics';

// ── Status icon helper ────────────────────────────────────────────────────────
function StatusIcon({ status, size = 'w-4 h-4' }: { status: string; size?: string }) {
  if (status === 'success') return <CheckCircle2 className={cn(size, 'text-success')} />;
  if (status === 'warning') return <AlertTriangle className={cn(size, 'text-warning')} />;
  if (status === 'failed')  return <XCircle className={cn(size, 'text-destructive')} />;
  return <Info className={cn(size, 'text-muted-foreground')} />;
}

// ── Stage label map ───────────────────────────────────────────────────────────
const STAGE_LABELS: Record<string, { label: string; icon: any }> = {
  fetch:         { label: 'Page Fetch',      icon: Globe },
  parse:         { label: 'HTML Parse',      icon: Database },
  json_ld:       { label: 'JSON-LD',         icon: Zap },
  meta:          { label: 'Meta Tags',       icon: Tag },
  price:         { label: 'Price Extract',   icon: Tag },
  image:         { label: 'Image Extract',   icon: Image },
  description:   { label: 'Description',     icon: FileText },
  category:      { label: 'Category',        icon: BarChart3 },
  validation:    { label: 'Validation',      icon: CheckCircle2 },
  export:        { label: 'Export Map',      icon: Activity },
  listing:       { label: 'Listing Page',    icon: Globe },
  detail:        { label: 'Detail Page',     icon: Globe },
};

// ── URL Inspection Drawer ─────────────────────────────────────────────────────
function InspectionDrawer({
  diag,
  open,
  onOpenChange,
}: {
  diag: ScrapeDiagnostic | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const analyzeFailure = useAnalyzeFailure();
  const [analysis, setAnalysis] = useState<Record<string, any> | null>(null);

  async function handleAnalyze() {
    if (!diag) return;
    const res = await analyzeFailure.mutateAsync({ diagnostic_id: diag.id });
    setAnalysis(res.analysis);
  }

  if (!diag) return null;

  const stageInfo = STAGE_LABELS[diag.stage] ?? { label: diag.stage, icon: Activity };
  const StageIcon = stageInfo.icon;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[520px] max-w-full p-0 flex flex-col" side="right">
        <SheetHeader className="px-5 py-4 border-b border-border flex-shrink-0">
          <SheetTitle className="text-[14px] font-semibold flex items-center gap-2">
            <StatusIcon status={diag.status} size="w-4 h-4" />
            URL Inspection
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{diag.url ?? 'No URL'}</p>
        </SheetHeader>

        <ScrollArea className="flex-1 px-5 py-4">
          <div className="space-y-4">
            {/* Overview grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Stage',        value: stageInfo.label },
                { label: 'Status',       value: diag.status },
                { label: 'HTTP',         value: diag.http_status ?? '—' },
                { label: 'Retries',      value: diag.retry_count },
                { label: 'Duration',     value: diag.duration_ms ? `${diag.duration_ms}ms` : '—' },
                { label: 'Source',       value: diag.source_key ?? '—' },
                { label: 'Parser',       value: diag.parser_used ?? '—' },
                { label: 'Field',        value: diag.field_name ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-muted/40 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
                  <p className="text-[12px] font-semibold text-foreground truncate">{String(value)}</p>
                </div>
              ))}
            </div>

            {/* Failure reason */}
            {diag.failure_reason && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-destructive mb-1">Failure Reason</p>
                <p className="text-[12px] text-foreground">{diag.failure_reason}</p>
              </div>
            )}

            {/* Selector used */}
            {diag.selector_used && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1">Selector Used</p>
                <code className="block bg-muted rounded-lg px-3 py-2 text-[11px] text-foreground font-mono break-all">
                  {diag.selector_used}
                </code>
              </div>
            )}

            {/* Missing fields */}
            {diag.missing_fields?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Missing Fields</p>
                <div className="flex flex-wrap gap-1.5">
                  {diag.missing_fields.map(f => (
                    <Badge key={f} variant="outline" className="text-[10px] text-destructive border-destructive/40">{f}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Extracted preview */}
            {diag.extracted_value_preview && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1">Extracted Value Preview</p>
                <p className="text-[12px] bg-muted rounded-lg px-3 py-2 break-all">{diag.extracted_value_preview}</p>
              </div>
            )}

            {/* Raw error */}
            {diag.raw_error && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground mb-1">Raw Error</p>
                <code className="block bg-muted rounded-lg px-3 py-2 text-[10px] font-mono text-destructive break-all whitespace-pre-wrap">
                  {diag.raw_error}
                </code>
              </div>
            )}

            {/* Debug payload */}
            {diag.debug_payload && (
              <details className="group">
                <summary className="text-[11px] font-semibold text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  Debug Payload ▸
                </summary>
                <pre className="mt-2 bg-muted rounded-lg p-3 text-[10px] font-mono overflow-auto max-h-48">
                  {JSON.stringify(diag.debug_payload, null, 2)}
                </pre>
              </details>
            )}

            {/* AI Analysis */}
            <div className="border border-primary/20 rounded-xl p-3 bg-primary/5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-primary flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Analysis
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] text-primary px-2"
                  onClick={handleAnalyze}
                  disabled={analyzeFailure.isPending}
                >
                  {analyzeFailure.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {diag.ai_analysis || analysis ? 'Re-analyse' : 'Analyse'}
                </Button>
              </div>

              {(analysis || diag.ai_analysis) ? (
                <div className="space-y-2">
                  <p className="text-[12px] text-foreground">
                    {(analysis?.plain_english as string) ?? diag.ai_analysis}
                  </p>
                  {analysis?.problem_category && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {String(analysis.problem_category).replace(/_/g, ' ')}
                      </Badge>
                      {analysis.priority && (
                        <Badge variant="outline" className={cn('text-[10px]',
                          analysis.priority === 'high' ? 'text-destructive border-destructive/40' :
                          analysis.priority === 'medium' ? 'text-warning border-warning/40' : ''
                        )}>
                          {String(analysis.priority)} priority
                        </Badge>
                      )}
                    </div>
                  )}
                  {(analysis?.fix_suggestion ?? diag.ai_recommendation) && (
                    <div className="bg-success/10 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-semibold text-success mb-0.5">Recommended Fix</p>
                      <p className="text-[11px] text-foreground">
                        {(analysis?.fix_suggestion as string) ?? diag.ai_recommendation}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Click "Analyse" to get an AI explanation of this failure.
                </p>
              )}
            </div>

            {/* URL link */}
            {diag.url && (
              <a
                href={diag.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[12px] text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open source URL
              </a>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── Source Summary Card ───────────────────────────────────────────────────────
function SourceSummaryCard({ summary }: { summary: any }) {
  const hasFailures = summary.failed > 0;
  return (
    <div className={cn(
      'bg-card rounded-2xl border p-4 hover:shadow-card-md transition-shadow',
      hasFailures ? 'border-destructive/30' : 'border-border'
    )}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[13px] font-semibold text-foreground">{summary.source_key}</p>
        <Badge variant="outline" className={cn('text-[9px]',
          hasFailures ? 'text-destructive border-destructive/40' : 'text-muted-foreground'
        )}>
          {hasFailures ? `${summary.failed} errors` : 'clean'}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div>
          <p className="text-[15px] font-bold text-foreground">{summary.total}</p>
          <p className="text-[9px] text-muted-foreground">Events</p>
        </div>
        <div>
          <p className={cn('text-[15px] font-bold', summary.failed > 0 ? 'text-destructive' : 'text-muted-foreground')}>
            {summary.failed}
          </p>
          <p className="text-[9px] text-muted-foreground">Errors</p>
        </div>
        <div>
          <p className={cn('text-[15px] font-bold', summary.warnings > 0 ? 'text-warning' : 'text-muted-foreground')}>
            {summary.warnings}
          </p>
          <p className="text-[9px] text-muted-foreground">Warnings</p>
        </div>
      </div>
      {summary.total > 0 && (
        <div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-destructive rounded-full"
              style={{ width: `${Math.round((summary.failed / summary.total) * 100)}%` }}
            />
          </div>
          <p className="text-[9px] text-muted-foreground mt-1">
            {Math.round(((summary.total - summary.failed) / summary.total) * 100)}% success rate
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Diagnostics Page ─────────────────────────────────────────────────────
export default function Diagnostics() {
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterStage, setFilterStage] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedDiag, setSelectedDiag] = useState<ScrapeDiagnostic | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [runSummaryAnalysis, setRunSummaryAnalysis] = useState<Record<string, any> | null>(null);
  const [page, setPage] = useState(1);

  const analyzeFailure = useAnalyzeFailure();
  const { data: summary, isLoading: summaryLoading } = useDiagnosticsSummary();
  const { data: diagData, isLoading: diagLoading } = useDiagnostics({
    source_key: filterSource !== 'all' ? filterSource : undefined,
    stage: filterStage !== 'all' ? filterStage : undefined,
    status: filterStatus !== 'all' ? filterStatus : undefined,
    search: search || undefined,
    page,
    pageSize: 50,
  });

  const { data: stores } = useStores();
  const updateStore = useUpdateStore();

  const diagnostics = diagData?.data ?? [];
  const totalCount = diagData?.count ?? 0;

  function openInspection(diag: ScrapeDiagnostic) {
    setSelectedDiag(diag);
    setDrawerOpen(true);
  }

  async function handleRunSummaryAnalysis() {
    if (!summary) return;
    const res = await analyzeFailure.mutateAsync({
      run_summary: {
        total_errors: summary.totalErrors,
        total_warnings: summary.totalWarnings,
        stage_failures: summary.stageFailures,
        field_failures: summary.fieldFailures,
        by_source: summary.bySource,
      },
    });
    setRunSummaryAnalysis(res.analysis);
  }

  const uniqueSources = Array.from(new Set(diagnostics.map(d => d.source_key).filter(Boolean)));
  const uniqueStages = Array.from(new Set(diagnostics.map(d => d.stage).filter(Boolean)));

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-border px-6 py-3 flex items-center justify-between bg-card">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">Diagnostics</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Per-stage failure tracking & AI-assisted root cause analysis
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-2 text-[12px] h-8"
          onClick={handleRunSummaryAnalysis}
          disabled={analyzeFailure.isPending || !summary}
        >
          {analyzeFailure.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-primary" />}
          AI Health Summary
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">

          {/* KPI row */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Events',    value: summary?.totalErrors ? (summary.totalErrors + summary.totalWarnings) : 0, icon: Activity,      color: 'text-foreground' },
              { label: 'Critical Errors', value: summary?.criticalCount ?? 0, icon: XCircle,        color: 'text-destructive' },
              { label: 'Warnings',        value: summary?.totalWarnings ?? 0,  icon: AlertTriangle,  color: 'text-warning' },
              { label: 'Failed Stages',   value: Object.keys(summary?.stageFailures ?? {}).length, icon: BarChart3, color: 'text-primary' },
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

          {/* AI Run Summary */}
          {runSummaryAnalysis && (
            <div className="bg-card rounded-2xl border border-primary/30 p-5 shadow-card">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <p className="text-[13px] font-semibold text-foreground">AI Health Summary</p>
              </div>
              <p className="text-[13px] text-foreground mb-3">{runSummaryAnalysis.summary}</p>
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

          {/* Source summary grid */}
          {!summaryLoading && summary && summary.bySource.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Source Breakdown</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {summary.bySource.map(s => (
                  <SourceSummaryCard key={s.source_key} summary={s} />
                ))}
              </div>
            </div>
          )}

          {/* Stage failure heatmap */}
          {summary && Object.keys(summary.stageFailures).length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-4 shadow-card">
              <p className="text-[12px] font-semibold text-foreground mb-3">Failure Heatmap by Stage</p>
              <div className="space-y-2">
                {Object.entries(summary.stageFailures)
                  .sort((a, b) => b[1] - a[1])
                  .map(([stage, count]) => {
                    const max = Math.max(...Object.values(summary.stageFailures));
                    const pct = Math.round((count / max) * 100);
                    const info = STAGE_LABELS[stage] ?? { label: stage, icon: Activity };
                    const StageIcon = info.icon;
                    return (
                      <div key={stage} className="flex items-center gap-3">
                        <StageIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <div className="w-24 text-[11px] text-muted-foreground shrink-0">{info.label}</div>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-destructive/70 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold text-destructive w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Filters + table */}
          <div className="bg-card rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-border flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search failures, URLs, errors…"
                  className="pl-9 h-8 text-[12px]"
                />
              </div>
              <Select value={filterSource} onValueChange={v => { setFilterSource(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-[11px] w-36">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {uniqueSources.map(s => <SelectItem key={s!} value={s!}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStage} onValueChange={v => { setFilterStage(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-[11px] w-36">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {uniqueStages.map(s => <SelectItem key={s} value={s}>{STAGE_LABELS[s]?.label ?? s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-[11px] w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
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
                    {['Time', 'Source', 'Stage', 'URL', 'Status', 'Failure Reason', 'AI', ''].map(h => (
                      <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {diagLoading && Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-3 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!diagLoading && diagnostics.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-[12px]">
                        No diagnostics yet. Run a scrape to see failure data here.
                      </td>
                    </tr>
                  )}
                  {diagnostics.map(diag => {
                    const stageInfo = STAGE_LABELS[diag.stage] ?? { label: diag.stage, icon: Activity };
                    const StageIconSmall = stageInfo.icon;
                    return (
                      <tr
                        key={diag.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => openInspection(diag)}
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {new Date(diag.created_at).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="font-medium text-foreground">{diag.source_key ?? '—'}</span>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <StageIconSmall className="w-3 h-3 text-muted-foreground" />
                            <span>{stageInfo.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 max-w-[200px]">
                          <p className="truncate text-muted-foreground text-[11px]">{diag.url ?? '—'}</p>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <StatusIcon status={diag.status} size="w-3.5 h-3.5" />
                            {diag.http_status ? (
                              <span className={cn('text-[10px] font-semibold',
                                diag.http_status >= 400 ? 'text-destructive' :
                                diag.http_status >= 300 ? 'text-warning' : 'text-success'
                              )}>
                                {diag.http_status}
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 max-w-[240px]">
                          <p className="truncate text-[11px]">{diag.failure_reason ?? '—'}</p>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {diag.ai_analysis ? (
                            <span className="text-primary flex items-center gap-1 text-[10px]">
                              <Sparkles className="w-3 h-3" /> analysed
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalCount > 50 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  Previous
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Page {page} of {Math.ceil(totalCount / 50)}
                </p>
                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(totalCount / 50)}>
                  Next
                </Button>
              </div>
            )}
          </div>

        </div>
      </div>

      <InspectionDrawer diag={selectedDiag} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
