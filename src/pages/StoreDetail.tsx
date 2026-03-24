/**
 * StoreDetail page — Block 6: Store health panel with operational metrics.
 */
import { Link, useParams } from 'react-router-dom';
import { useStores, useUpdateStore } from '@/hooks/useStores';
import { useRevalidateStores, useScrapeStores } from '@/hooks/useStoreActions';
import { useStoreMetricsHistory } from '@/hooks/usePriceHistory';
import { useProducts } from '@/hooks/useProducts';
import { useStoreHealth } from '@/hooks/useStoreHealth';
import { useStoreDiagnostics } from '@/hooks/useStoreDiagnostics';
import { useStoreRetryHistory } from '@/hooks/useStoreRetryHistory';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import {
  Package, TrendingDown, Clock, ExternalLink, Loader2, Power,
  CheckCircle2, AlertTriangle, XCircle, Activity, Image, FileText, Tag,
  ShieldAlert, Zap, Globe,
} from 'lucide-react';
import { formatPrice } from '@/lib/url';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// ── Health badge ───────────────────────────────────────────────────────────────
function HealthBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: any }> = {
    healthy:      { label: 'Healthy',      cls: 'bg-success/15 text-success border-success/30',         icon: CheckCircle2 },
    degraded:     { label: 'Degraded',     cls: 'bg-warning/15 text-warning border-warning/30',         icon: AlertTriangle },
    failing:      { label: 'Failing',      cls: 'bg-destructive/15 text-destructive border-destructive/30', icon: XCircle },
    blocked:      { label: 'Blocked',      cls: 'bg-destructive/15 text-destructive border-destructive/30', icon: ShieldAlert },
    auth_required:{ label: 'Auth Required', cls: 'bg-warning/15 text-warning border-warning/30',         icon: ShieldAlert },
    zero_products:{ label: 'Zero Products', cls: 'bg-warning/15 text-warning border-warning/30',         icon: AlertTriangle },
    stale:        { label: 'Stale',        cls: 'bg-warning/15 text-warning border-warning/30',         icon: Clock },
    unknown:      { label: 'Unknown',      cls: 'bg-muted text-muted-foreground border-border',          icon: Activity },
  };
  const s = map[status] ?? map.unknown;
  const Icon = s.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[12px] font-semibold border', s.cls)}>
      <Icon className="w-3.5 h-3.5" />
      {s.label}
    </span>
  );
}

// ── Missing rate bar ───────────────────────────────────────────────────────────
function MissingBar({ label, pct, icon: Icon }: { label: string; pct: number; icon: any }) {
  const color = pct >= 40 ? 'bg-destructive' : pct >= 20 ? 'bg-warning' : 'bg-success';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="w-3 h-3" />
          {label}
        </span>
        <span className={cn('font-semibold tabular-nums',
          pct >= 40 ? 'text-destructive' : pct >= 20 ? 'text-warning' : 'text-success'
        )}>
          {pct}% missing
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function StoreDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: stores } = useStores();
  const updateStore = useUpdateStore();
  const store = stores?.find(s => s.id === id);
  const { data: metrics } = useStoreMetricsHistory(id ?? null);
  const { data: _productsData } = useProducts({ page: 1, pageSize: 5, storeId: id, sortBy: 'scraped_at', sortDir: 'desc' });
  const { data: health, isLoading: healthLoading } = useStoreHealth(id, store);
  const { data: diagnosticsMap } = useStoreDiagnostics(store ? [store] : undefined);
  const diagnostic = store ? diagnosticsMap?.[store.id] : undefined;
  const { data: retryHistory } = useStoreRetryHistory(id ?? null);
  const revalidateStores = useRevalidateStores();
  const scrapeStores = useScrapeStores();

  if (!store) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  const chartData = metrics?.map((m: any) => ({
    date: new Date(m.snapshot_at).toLocaleDateString(),
    products: m.total_products,
    avgPrice: m.avg_price_min,
    changes: m.price_changes,
  })) ?? [];

  const scrapeabilityScore = (store as any).scrapeability_score ?? 0;
  const platform = (store as any).platform ?? 'unknown';
  const storeType = (store as any).store_type ?? 'unknown';

  return (
    <div className="p-6 space-y-6 max-w-4xl overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{store.name}</h1>
            {health && <HealthBadge status={health.healthBadge} />}
          </div>
          <a href={store.url} target="_blank" rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 mt-1">
            {store.normalized_url} <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-colors ${
          store.enabled ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/40'
        }`}>
          <Power className={`w-4 h-4 ${store.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
          <Label
            htmlFor={`store-toggle-${store.id}`}
            className={`text-sm font-semibold cursor-pointer select-none ${store.enabled ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {store.enabled ? 'Enabled' : 'Disabled'}
          </Label>
          <Switch
            id={`store-toggle-${store.id}`}
            checked={store.enabled}
            onCheckedChange={(checked) => updateStore.mutate({ id: store.id, enabled: checked })}
            disabled={updateStore.isPending}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => revalidateStores.mutate([store])}
          disabled={revalidateStores.isPending}
        >
          Revalidate store
        </Button>
        <Button
          size="sm"
          onClick={() => scrapeStores.mutate({ storeIds: [store.id], modeLabel: 'Scrape run' })}
          disabled={scrapeStores.isPending}
        >
          Scrape now
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/diagnostics?store=${store.id}`}>Open diagnostics</Link>
        </Button>
      </div>

      {diagnostic && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Recommended action</p>
              <p className="text-sm text-foreground mt-1">{diagnostic.recommendedAction}</p>
            </div>
            <Badge variant="outline" className="text-[10px]">{diagnostic.label}</Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(diagnostic.status === 'invalid' || diagnostic.status === 'never_scraped') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => revalidateStores.mutate([store])}
                disabled={revalidateStores.isPending}
              >
                Revalidate now
              </Button>
            )}
            {(diagnostic.status === 'timeout_fallout' || diagnostic.status === 'retryable_http_error' || diagnostic.status === 'stale' || diagnostic.status === 'zero_products' || diagnostic.status === 'failing') && (
              <Button
                size="sm"
                onClick={() => scrapeStores.mutate({ storeIds: [store.id], modeLabel: 'Focused retry' })}
                disabled={scrapeStores.isPending}
              >
                Follow recommendation
              </Button>
            )}
            {diagnostic.status === 'timeout_fallout' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => scrapeStores.mutate({
                  storeIds: [store.id],
                  modeLabel: 'Small-batch retry',
                  overrides: { maxConcurrentStores: 1 },
                })}
                disabled={scrapeStores.isPending}
              >
                Retry in smaller batch
              </Button>
            )}
            {diagnostic.status === 'retryable_http_error' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => scrapeStores.mutate({
                  storeIds: [store.id],
                  modeLabel: 'Slow-pacing retry',
                  overrides: { interPageDelay: 2000, maxConcurrentStores: 1 },
                })}
                disabled={scrapeStores.isPending}
              >
                Retry with slow pacing
              </Button>
            )}
            {diagnostic.status === 'auth_required' && (
              <Button asChild variant="outline" size="sm">
                <Link to={`/diagnostics?store=${store.id}`}>Review auth/block evidence</Link>
              </Button>
            )}
            {diagnostic.status === 'blocked' && (
              <Button asChild variant="outline" size="sm">
                <Link to={`/diagnostics?store=${store.id}`}>Inspect blocking signals</Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {retryHistory && retryHistory.length > 0 && (
        <div className="bg-card rounded-2xl border border-border shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-[13px] font-bold text-foreground">Retry History</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">See whether smaller-batch or slow-pacing retries improved outcomes for this store.</p>
            </div>
          </div>
          <div className="space-y-2">
            {retryHistory.map((entry: any) => (
              <div key={entry.id} className="rounded-xl border border-border bg-muted/20 px-3 py-2 flex items-center gap-3 flex-wrap text-[11px]">
                <Badge variant="outline" className="text-[10px]">{entry.modeLabel}</Badge>
                <span className={cn('font-semibold', entry.helped ? 'text-success' : entry.status === 'error' ? 'text-destructive' : 'text-foreground')}>
                  {entry.beatBaseline ? 'Beat baseline' : entry.helped ? 'Helped' : entry.status === 'completed' ? 'Completed' : entry.status}
                </span>
                <span className="text-muted-foreground">{entry.productCount} products</span>
                <span className="text-muted-foreground">{entry.pageCount} pages</span>
                <span className="text-muted-foreground">{entry.collectionsCompleted} collections</span>
                {entry.deltaProducts !== null && (
                  <span className={cn('font-medium', entry.deltaProducts > 0 ? 'text-success' : entry.deltaProducts < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    Δ products {entry.deltaProducts > 0 ? '+' : ''}{entry.deltaProducts}
                  </span>
                )}
                {entry.deltaPages !== null && (
                  <span className={cn('font-medium', entry.deltaPages > 0 ? 'text-success' : entry.deltaPages < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    Δ pages {entry.deltaPages > 0 ? '+' : ''}{entry.deltaPages}
                  </span>
                )}
                {entry.collectionsFailed > 0 && <span className="text-warning">{entry.collectionsFailed} collection failures</span>}
                <span className="text-muted-foreground ml-auto">{new Date(entry.updatedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Store Health Panel ─────────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border shadow-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold text-foreground">Store Health</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {platform !== 'unknown' && (
              <Badge variant="outline" className="text-[10px] uppercase">{platform}</Badge>
            )}
            {storeType !== 'unknown' && (
              <Badge variant="outline" className="text-[10px]">{storeType.replace(/_/g, ' ')}</Badge>
            )}
          </div>
        </div>

        {/* Scrapeability score */}
        {scrapeabilityScore > 0 && (
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" />Scrapeability</span>
              <span className={cn('font-bold tabular-nums',
                scrapeabilityScore >= 80 ? 'text-success' : scrapeabilityScore >= 60 ? 'text-warning' : 'text-destructive'
              )}>
                {scrapeabilityScore}/100
              </span>
            </div>
            <Progress
              value={scrapeabilityScore}
              className={cn('h-1.5',
                scrapeabilityScore >= 80 ? '[&>div]:bg-success' : scrapeabilityScore >= 60 ? '[&>div]:bg-warning' : '[&>div]:bg-destructive'
              )}
            />
          </div>
        )}

        {/* Product counts grid */}
        {healthLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-muted/40 rounded-xl p-3 h-14 animate-pulse" />
            ))}
          </div>
        ) : health && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Discovered',       value: health.discovered,      color: 'text-foreground' },
              { label: 'Enriched',         value: health.enriched,        color: 'text-success' },
              { label: 'Ready',            value: health.ready,           color: 'text-success' },
              { label: 'Review Required',  value: health.reviewRequired,  color: health.reviewRequired > 0 ? 'text-warning' : 'text-muted-foreground' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-muted/40 rounded-xl p-3">
                <p className={cn('text-[18px] font-bold tabular-nums', color)}>{value.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Missing rates */}
        {health && health.totalProducts > 0 && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Field Coverage</p>
            <MissingBar label="Price"       pct={health.missingPricePct}       icon={Tag} />
            <MissingBar label="Images"      pct={health.missingImagePct}       icon={Image} />
            <MissingBar label="Description" pct={health.missingDescriptionPct} icon={FileText} />
          </div>
        )}

        {/* Failures */}
        {health && (
          <div className="space-y-2 pt-1 border-t border-border">
            <div className="flex items-center gap-4 text-[11px] flex-wrap">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Failures last 7 days:</span>
                <span className={cn('font-bold tabular-nums',
                  health.failuresLast7Days >= 3 ? 'text-destructive' : health.failuresLast7Days > 0 ? 'text-warning' : 'text-success'
                )}>
                  {health.failuresLast7Days}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Warnings last 7 days:</span>
                <span className={cn('font-bold tabular-nums', health.warningsLast7Days > 0 ? 'text-warning' : 'text-success')}>
                  {health.warningsLast7Days}
                </span>
              </div>
              {(store as any).antibot_suspected && (
                <span className="text-warning flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" /> Anti-bot suspected
                </span>
              )}
              {store.last_scraped_at && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Last scraped {new Date(store.last_scraped_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            {health.latestErrorMessage && (
              <div className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-[11px]">
                <span className="font-semibold text-warning">Latest issue:</span>{' '}
                <span className="text-foreground">{health.latestErrorMessage}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legacy KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1"><Package className="w-3.5 h-3.5" /><span className="text-xs">Products</span></div>
          <p className="text-2xl font-bold">{store.total_products.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1"><Clock className="w-3.5 h-3.5" /><span className="text-xs">Last Scraped</span></div>
          <p className="text-sm font-medium">{store.last_scraped_at ? new Date(store.last_scraped_at).toLocaleString() : '—'}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1"><TrendingDown className="w-3.5 h-3.5" /><span className="text-xs">Price Changes</span></div>
          <p className="text-2xl font-bold">{metrics?.reduce((s: number, m: any) => s + m.price_changes, 0) ?? 0}</p>
        </div>
      </div>

      {/* Charts */}
      {chartData.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Product Count Trend</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }} />
                <Bar dataKey="products" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Avg Price Trend</p>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={chartData}>
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `$${v}`} />
                <Tooltip formatter={(v: any) => formatPrice(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 11 }} />
                <Line type="monotone" dataKey="avgPrice" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {chartData.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No scrape history yet. Run a scrape to see trends.
        </div>
      )}
    </div>
  );
}
