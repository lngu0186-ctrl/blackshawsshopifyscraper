import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useScrapedProducts, useScrapeSource, useEnrichProducts, useCreateScrapeJob } from '@/hooks/useScrapedProducts';
import { usePipelineStats } from '@/hooks/usePipelineStats';
import { exportShopifyReadyCsv, exportReviewRequiredCsv } from '@/lib/csvExport';
import { exportFullRawExcel } from '@/lib/xlsxExport';
import { useExport } from '@/hooks/useExport';
import { useStores } from '@/hooks/useStores';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, FileSpreadsheet, History, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw, ExternalLink, Info } from 'lucide-react';
import { SITE_ADAPTERS } from '@/lib/siteAdapters';
import { toast } from 'sonner';

// ─── Data Quality Panel ──────────────────────────────────────────────────────
function DataQualityPanel({ onEnrich }: { onEnrich: () => void }) {
  const { data: stats, isLoading } = usePipelineStats();
  const enrichMutation = useEnrichProducts();

  const total = stats?.discovered ?? 0;
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  function Bar({ value, max, color }: { value: number; max: number; color: string }) {
    const w = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13.5px] font-bold text-foreground">Data Quality</h2>
        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground w-32 shrink-0">Total discovered</span>
          <span className="font-semibold tabular-nums">{total.toLocaleString()}</span>
        </div>
        {[
          { label: 'Shopify Ready',  value: stats?.readyCount ?? 0,    color: 'bg-primary',     icon: <CheckCircle2 className="w-3 h-3 text-primary" /> },
          { label: 'Review Needed',  value: stats?.reviewRequired ?? 0, color: 'bg-warning',     icon: <AlertTriangle className="w-3 h-3 text-warning" /> },
          { label: 'Partial / Raw',  value: stats?.partialRaw ?? 0,    color: 'bg-destructive',  icon: <XCircle className="w-3 h-3 text-destructive" /> },
        ].map(row => (
          <div key={row.label} className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground w-32 shrink-0 flex items-center gap-1">{row.icon}{row.label}</span>
            <span className="font-semibold tabular-nums w-12">{row.value.toLocaleString()}</span>
            <span className="text-muted-foreground w-8">({pct(row.value)}%)</span>
            <Bar value={row.value} max={total} color={row.color} />
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-3 space-y-1.5 text-xs text-muted-foreground">
        <div className="flex justify-between"><span>Missing price</span><span className="font-medium text-foreground">{stats?.missingPrice ?? 0}</span></div>
        <div className="flex justify-between"><span>Missing image</span><span className="font-medium text-foreground">{stats?.missingImage ?? 0}</span></div>
        <div className="flex justify-between"><span>Missing description</span><span className="font-medium text-foreground">{stats?.missingDescription ?? 0}</span></div>
        <div className="flex justify-between"><span>Detail page failed</span><span className="font-medium text-foreground">{stats?.detailFailed ?? 0}</span></div>
      </div>

      <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground flex gap-2">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>Export button counts below are derived from this same data. No discrepancy.</span>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full h-8 text-xs gap-1.5"
        onClick={onEnrich}
        disabled={enrichMutation.isPending}
      >
        {enrichMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        Enrich Pending Products
      </Button>
    </div>
  );
}

// ─── Product Review Table ────────────────────────────────────────────────────
function ProductReviewTable() {
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const enrichMutation = useEnrichProducts();

  const { data, isLoading } = useScrapedProducts({
    source_key: sourceFilter !== 'all' ? sourceFilter : undefined,
    scrape_status: statusFilter !== 'all' ? statusFilter : undefined,
    page,
    pageSize: 30,
  });

  const products = data?.data ?? [];
  const total = data?.count ?? 0;
  const totalPages = Math.ceil(total / 30);

  function confidenceBadge(score: number) {
    if (score >= 90) return <Badge variant="outline" className="text-[10px] py-0 text-primary border-primary/40">Ready ({score})</Badge>;
    if (score >= 60) return <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">Review ({score})</Badge>;
    return <Badge variant="destructive" className="text-[10px] py-0">Partial ({score})</Badge>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="All sources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {Object.entries(SITE_ADAPTERS).map(([key, a]) => (
              <SelectItem key={key} value={key}>{a.sourceName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="enriched">Enriched</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : products.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No products found. Run a scrape from the Sources tab first.
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Thumbnail</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Source</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Price</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Confidence</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Missing</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2">
                    {p.image_url
                      ? <img src={p.image_url} alt="" className="w-10 h-10 object-cover rounded border border-border" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      : <div className="w-10 h-10 rounded border border-border bg-muted flex items-center justify-center"><FileText className="w-3 h-3 text-muted-foreground" /></div>
                    }
                  </td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <p className="truncate font-medium text-foreground">{p.title}</p>
                    {p.brand && <p className="text-muted-foreground">{p.brand}</p>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{p.source_name}</td>
                  <td className="px-3 py-2">
                    {p.price != null
                      ? <span className="font-medium text-foreground">${p.price.toFixed(2)}</span>
                      : <span className="text-destructive">—</span>
                    }
                  </td>
                  <td className="px-3 py-2">{confidenceBadge(p.confidence_score)}</td>
                  <td className="px-3 py-2 max-w-[160px]">
                    <span className="text-muted-foreground truncate block">{(p.missing_fields ?? []).join(', ') || '—'}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0"
                        title="Open source page"
                        onClick={() => window.open(p.source_url, '_blank')}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0"
                        title="Re-enrich"
                        disabled={enrichMutation.isPending}
                        onClick={() => enrichMutation.mutate({ product_id: p.id }, {
                          onSuccess: () => toast.success('Re-enrichment complete'),
                        })}
                      >
                        <RefreshCw className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total.toLocaleString()} products</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-6 text-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <span className="px-2 py-0.5">Page {page} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-6 text-xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sources / Scrape Panel ──────────────────────────────────────────────────
function SourcesPanel() {
  const scrapeSource = useScrapeSource();
  const enrichMutation = useEnrichProducts();
  const createJob = useCreateScrapeJob();

  async function handleScrape(sourceKey: string) {
    const job = await createJob.mutateAsync({ source_key: sourceKey, job_type: 'full' });
    scrapeSource.mutate({ source_key: sourceKey, job_id: job.id });
  }

  async function handleEnrich(sourceKey: string) {
    enrichMutation.mutate({ source_key: sourceKey, limit: 50 });
  }

  return (
    <div className="space-y-3">
      {Object.entries(SITE_ADAPTERS).map(([key, adapter]) => (
        <div key={key} className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{adapter.sourceName}</p>
            <p className="text-[11px] text-muted-foreground">{adapter.baseUrl} · {adapter.platform}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
              onClick={() => handleScrape(key)}
              disabled={scrapeSource.isPending}>
              {scrapeSource.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Discover
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
              onClick={() => handleEnrich(key)}
              disabled={enrichMutation.isPending}>
              {enrichMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Enrich
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Export Page ────────────────────────────────────────────────────────
export default function Export() {
  // Legacy store-based export
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [changedOnly, setChangedOnly] = useState(false);
  const [includeIncomplete, setIncludeIncomplete] = useState(false);
  const { data: stores } = useStores();
  const { exportShopifyCsv, exportJson, exportExcel, exportPriceHistoryCsv } = useExport();
  const storeIds = scope === 'selected' ? selectedStoreIds : undefined;

  // Use canonical pipeline stats for all counts — same source as Dashboard
  const { data: pipeline, isLoading: pipelineLoading } = usePipelineStats();
  const readyCount    = pipeline?.readyCount ?? 0;
  const reviewCount   = pipeline?.reviewRequired ?? 0;
  const totalProducts = pipeline?.discovered ?? 0;
  const enrichMutation = useEnrichProducts();

  // Lazy-load all products only when export is triggered
  async function fetchAllForExport(minScore?: number, maxScore?: number, requirePrice?: boolean) {
    const { useAuth: _u, ..._ } = await import('@/hooks/useAuth');
    // Use supabase directly with paginated loop
    const { supabase: sb } = await import('@/lib/supabase');
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return [];
    let all: any[] = [];
    let from = 0;
    const batchSize = 500;
    while (true) {
      let q = sb
        .from('scraped_products')
        .select('*')
        .eq('user_id', session.user.id)
        .range(from, from + batchSize - 1);
      if (minScore != null) q = q.gte('confidence_score', minScore);
      if (maxScore != null) q = q.lt('confidence_score', maxScore);
      if (requirePrice) q = q.not('price', 'is', null);
      const { data } = await q;
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < batchSize) break;
      from += batchSize;
    }
    return all;
  }

  async function handleExportReady() {
    toast.info('Fetching export-ready products…');
    const eligible = await fetchAllForExport(90, undefined, true);
    if (eligible.length === 0) { toast.info('No Shopify-ready products to export'); return; }
    exportShopifyReadyCsv(eligible as any);
    toast.success(`Exported ${eligible.length} Shopify-ready rows`);
  }

  async function handleExportReview() {
    toast.info('Fetching review-required products…');
    const eligible = await fetchAllForExport(60, 90, false);
    if (eligible.length === 0) { toast.info('No review-required products'); return; }
    exportReviewRequiredCsv(eligible as any);
    toast.success(`Exported ${eligible.length} review-required rows`);
  }

  async function handleExportRaw() {
    toast.info('Fetching all products for Excel export…');
    const all = await fetchAllForExport();
    if (all.length === 0) { toast.info('No products to export'); return; }
    exportFullRawExcel(all as any);
    toast.success(`Exported ${all.length} rows as Excel`);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Top Bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border bg-white flex-shrink-0">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight text-foreground leading-none">Export</h1>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">Scrape, enrich, and export clean Shopify-ready data</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl">

      <Tabs defaultValue="export">
        <TabsList className="h-9 bg-muted/60 rounded-xl p-1">
          <TabsTrigger value="export" className="text-[12px] h-7 rounded-lg">Export</TabsTrigger>
          <TabsTrigger value="review" className="text-[12px] h-7 rounded-lg">Product Review</TabsTrigger>
          <TabsTrigger value="sources" className="text-[12px] h-7 rounded-lg">Sources</TabsTrigger>
          <TabsTrigger value="legacy" className="text-[12px] h-7 rounded-lg">Store Exports</TabsTrigger>
        </TabsList>

        {/* ── Export Panel ── */}
        <TabsContent value="export" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DataQualityPanel onEnrich={() => enrichMutation.mutate({ limit: 50 })} />

            <div className="space-y-3">
              <div className="bg-white rounded-2xl border border-border shadow-card p-5 space-y-3">
                <h2 className="text-[13.5px] font-bold text-foreground">Export Modes</h2>

                <Button className="w-full h-12 justify-start gap-3 rounded-xl bg-foreground hover:bg-foreground/90 text-background"
                  onClick={handleExportReady}>
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <div className="text-left">
                    <p className="text-[13px] font-semibold">Export Shopify Ready CSV</p>
                    <p className="text-[11px] opacity-70">{readyCount.toLocaleString()} rows — price guaranteed</p>
                  </div>
                </Button>

                <Button variant="outline" className="w-full h-12 justify-start gap-3 rounded-xl"
                  onClick={handleExportReview}>
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                  <div className="text-left">
                    <p className="text-[13px] font-semibold">Export Review Required CSV</p>
                    <p className="text-[11px] text-muted-foreground">{reviewCount.toLocaleString()} rows — missing fields column</p>
                  </div>
                </Button>

                <Button variant="outline" className="w-full h-12 justify-start gap-3 rounded-xl"
                  onClick={handleExportRaw}>
                  <FileSpreadsheet className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="text-left">
                    <p className="text-[13px] font-semibold">Export Full Raw Excel</p>
                    <p className="text-[11px] text-muted-foreground">{totalProducts.toLocaleString()} rows — all data + debug columns</p>
                  </div>
                </Button>

                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <Switch id="includeIncomplete" checked={includeIncomplete} onCheckedChange={setIncludeIncomplete} />
                  <Label htmlFor="includeIncomplete" className="text-[11.5px] cursor-pointer text-muted-foreground">Include incomplete rows in Shopify CSV</Label>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Product Review ── */}
        <TabsContent value="review" className="mt-4">
          <ProductReviewTable />
        </TabsContent>

        {/* ── Sources ── */}
        <TabsContent value="sources" className="mt-4">
          <SourcesPanel />
        </TabsContent>

        {/* ── Legacy store-based exports ── */}
        <TabsContent value="legacy" className="space-y-4 mt-4">
          <div className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-card">
            <h2 className="text-sm font-semibold">Store-based Exports (existing stores)</h2>

            <div className="space-y-1.5">
              <Label className="text-xs">Scope</Label>
              <Select value={scope} onValueChange={(v: any) => setScope(v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stores</SelectItem>
                  <SelectItem value="selected">Selected stores</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === 'selected' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Select stores</Label>
                <div className="space-y-1.5">
                  {stores?.map(s => (
                    <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="accent-primary" checked={selectedStoreIds.includes(s.id)}
                        onChange={e => setSelectedStoreIds(prev =>
                          e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                        )} />
                      <span className="text-sm">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Switch id="changedOnly" checked={changedOnly} onCheckedChange={setChangedOnly} />
              <Label htmlFor="changedOnly" className="text-sm cursor-pointer">Changed only (since last export)</Label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button className="h-12 justify-start gap-3 bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => exportShopifyCsv.mutate({ storeIds, changedOnly })}
              disabled={exportShopifyCsv.isPending}>
              {exportShopifyCsv.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <div className="text-left">
                <p className="text-sm font-medium">Export Shopify CSV</p>
                <p className="text-xs opacity-75">Importable product feed</p>
              </div>
            </Button>
            <Button variant="outline" className="h-12 justify-start gap-3"
              onClick={() => exportJson.mutate({ storeIds, changedOnly })}
              disabled={exportJson.isPending}>
              {exportJson.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <div className="text-left">
                <p className="text-sm font-medium">Export JSON</p>
                <p className="text-xs text-muted-foreground">Raw product data</p>
              </div>
            </Button>
            <Button variant="outline" className="h-12 justify-start gap-3"
              onClick={() => exportExcel.mutate({ storeIds, changedOnly })}
              disabled={exportExcel.isPending}>
              {exportExcel.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              <div className="text-left">
                <p className="text-sm font-medium">Export Excel (.xlsx)</p>
                <p className="text-xs text-muted-foreground">Shopify columns preserved</p>
              </div>
            </Button>
            <Button variant="outline" className="h-12 justify-start gap-3"
              onClick={() => exportPriceHistoryCsv.mutate({ storeIds })}
              disabled={exportPriceHistoryCsv.isPending}>
              {exportPriceHistoryCsv.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
              <div className="text-left">
                <p className="text-sm font-medium">Export Price History CSV</p>
                <p className="text-xs text-muted-foreground">All price change events</p>
              </div>
            </Button>
          </div>
        </TabsContent>
      </Tabs>
        </div>
      </div>
    </div>
  );
}
