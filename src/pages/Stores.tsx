import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ExternalLink, Lock,
  RefreshCcw, ShieldAlert, Store as StoreIcon, XCircle,
  Search, LayoutGrid, List, Plus,
} from 'lucide-react';
import { useStores } from '@/hooks/useStores';
import { useStoreDiagnostics } from '@/hooks/useStoreDiagnostics';
import { useBestKnownModes } from '@/hooks/useBestKnownModes';
import { useRevalidateStores, useScrapeStores } from '@/hooks/useStoreActions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

function statusTone(validationStatus: string, enabled: boolean) {
  if (!enabled) return 'bg-muted text-muted-foreground';
  if (validationStatus === 'valid') return 'bg-success/10 text-success';
  if (validationStatus === 'restricted' || validationStatus === 'password_protected') return 'bg-warning/10 text-warning';
  if (validationStatus === 'invalid') return 'bg-destructive/10 text-destructive';
  return 'bg-muted text-muted-foreground';
}

function diagnosticTone(status?: string) {
  switch (status) {
    case 'productive': return 'bg-success/10 text-success';
    case 'stale':
    case 'zero_products':
    case 'auth_required': return 'bg-warning/10 text-warning';
    case 'blocked':
    case 'failing':
    case 'invalid': return 'bg-destructive/10 text-destructive';
    default: return 'bg-muted text-muted-foreground';
  }
}

function healthDot(status?: string, enabled?: boolean) {
  if (!enabled) return 'bg-muted-foreground/30';
  if (status === 'productive') return 'bg-success';
  if (status === 'blocked' || status === 'failing' || status === 'invalid') return 'bg-destructive';
  if (status === 'auth_required' || status === 'stale') return 'bg-warning';
  return 'bg-muted-foreground/40';
}

function DiagnosticIcon({ status }: { status?: string }) {
  if (status === 'productive') return <CheckCircle2 className="w-3 h-3" />;
  if (status === 'blocked' || status === 'failing' || status === 'invalid') return <XCircle className="w-3 h-3" />;
  return <AlertTriangle className="w-3 h-3" />;
}

export default function Stores() {
  const { data: stores, isLoading } = useStores();
  const { data: diagnostics, isLoading: diagnosticsLoading } = useStoreDiagnostics(stores);
  const { data: bestKnownModes } = useBestKnownModes((stores ?? []).map(s => s.id));
  const revalidateStores = useRevalidateStores();
  const scrapeStores = useScrapeStores();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const selectedStores = useMemo(
    () => (stores ?? []).filter(store => selected.includes(store.id)),
    [stores, selected],
  );

  const filteredStores = useMemo(() => {
    if (!search.trim()) return stores ?? [];
    const q = search.toLowerCase();
    return (stores ?? []).filter(s =>
      s.name.toLowerCase().includes(q) || s.normalized_url.toLowerCase().includes(q),
    );
  }, [stores, search]);

  const toggleSelected = (storeId: string) => {
    setSelected(c => c.includes(storeId) ? c.filter(id => id !== storeId) : [...c, storeId]);
  };

  const toggleSelectAll = () => {
    if (!stores?.length) return;
    setSelected(c => c.length === stores.length ? [] : stores.map(s => s.id));
  };

  // Summary counts
  const counts = useMemo(() => {
    const d = Object.values(diagnostics ?? {});
    return {
      healthy: d.filter(r => r.status === 'productive').length,
      warning: d.filter(r => ['auth_required', 'stale', 'zero_products'].includes(r.status)).length,
      error: d.filter(r => ['blocked', 'failing', 'invalid'].includes(r.status)).length,
      total: stores?.length ?? 0,
    };
  }, [diagnostics, stores]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="px-6 pt-6 pb-3 flex-shrink-0">
        <div className="card-surface-md px-6 py-5">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="space-y-2">
              <div className="pill bg-muted/60 text-muted-foreground border border-border uppercase tracking-[0.18em] text-[10px]">
                Source library
              </div>
              <div>
                <h1 className="text-[34px] leading-none font-black tracking-tight text-foreground">Stores</h1>
                <p className="text-[13px] text-muted-foreground mt-2 max-w-2xl">Monitor store health, authentication, retry strategy, and scrape readiness from one calmer control surface.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {selected.length > 0 && <span className="text-[11px] text-muted-foreground px-2">{selected.length} selected</span>}
              {selected.length > 0 && (
                <>
                  <Button size="sm" variant="outline" className="h-10 text-[12px] rounded-full gap-1.5 px-4 bg-white"
                    onClick={() => revalidateStores.mutate(selectedStores)}
                    disabled={revalidateStores.isPending}>
                    <RefreshCcw className="w-3.5 h-3.5" /> Revalidate
                  </Button>
                  <Button size="sm" className="h-10 text-[12px] rounded-full bg-foreground hover:bg-foreground/90 text-background font-semibold gap-1.5 px-4"
                    onClick={() => scrapeStores.mutate({
                      storeIds: selectedStores.map(s => s.id),
                      modeByStore: Object.fromEntries(selectedStores.map(s => [s.id, bestKnownModes?.[s.id]?.mode ?? 'default'])),
                      modeLabel: 'Best-known mode bulk scrape',
                    })}
                    disabled={scrapeStores.isPending}>
                    Scrape selected
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" className="h-10 text-[12px] rounded-full gap-1.5 px-4 bg-white" asChild>
                <Link to="/diagnostics"><ExternalLink className="w-3.5 h-3.5" /> Diagnostics</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-6 py-3">
        <div className="flex items-center gap-6">
          {[
            { label: 'Total', value: counts.total, dot: 'bg-muted-foreground/30' },
            { label: 'Healthy', value: counts.healthy, dot: 'bg-success' },
            { label: 'Warning', value: counts.warning, dot: 'bg-warning' },
            { label: 'Error', value: counts.error, dot: 'bg-destructive' },
          ].map(({ label, value, dot }) => (
            <div key={label} className="card-surface px-4 py-3 flex items-center gap-2 min-w-[120px]">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
              <span className="text-[12px] font-bold text-foreground tabular-nums">{value}</span>
              <span className="text-[11px] text-muted-foreground">{label}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search stores…"
                className="pl-8 h-8 text-[12px] w-52 rounded-[22px] bg-background border-border"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {/* Select all */}
            <Button size="sm" variant="outline" className="h-8 text-[12px] rounded-[22px]"
              onClick={toggleSelectAll} disabled={isLoading || !(stores?.length)}>
              {selected.length === (stores?.length ?? 0) && selected.length > 0 ? 'Clear' : 'Select all'}
            </Button>
            {/* View toggle */}
            <div className="flex items-center border border-border rounded-[22px] overflow-hidden">
              <button
                onClick={() => setView('grid')}
                className={`px-2.5 py-1.5 transition-colors ${view === 'grid' ? 'bg-foreground text-background' : 'bg-white text-muted-foreground hover:bg-muted/40'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-2.5 py-1.5 transition-colors ${view === 'list' ? 'bg-foreground text-background' : 'bg-white text-muted-foreground hover:bg-muted/40'}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">

          {/* Grid view */}
          {view === 'grid' && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {isLoading && Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card-surface p-5 space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}

              {!isLoading && filteredStores.map((store) => {
                const authIcon = store.requires_auth
                  ? store.auth_type === 'customer_account'
                    ? <ShieldAlert className="w-3 h-3" />
                    : <Lock className="w-3 h-3" />
                  : null;
                const diagnostic = diagnostics?.[store.id];

                return (
                  <div
                    key={store.id}
                    className={`bg-white rounded-[28px] border shadow-card transition-all hover:shadow-card-md group ${
                      selected.includes(store.id) ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border'
                    }`}
                  >
                    {/* Card header */}
                    <div className="p-5 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={selected.includes(store.id)}
                            onChange={() => toggleSelected(store.id)}
                            className="mt-0.5 flex-shrink-0 accent-primary cursor-pointer"
                            aria-label={`Select ${store.name}`}
                          />
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${healthDot(diagnostic?.status, store.enabled)}`} />
                          <Link to={`/stores/${store.id}`} className="min-w-0 block group/link">
                            <p className="text-[13px] font-semibold text-foreground truncate group-hover/link:text-primary transition-colors">{store.name}</p>
                            <p className="text-[10.5px] text-muted-foreground mt-0.5 truncate">{store.normalized_url}</p>
                          </Link>
                        </div>
                        <Link to={`/stores/${store.id}`} className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>

                      {/* Badges */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusTone(store.validation_status, store.enabled)}`}>
                          {store.enabled ? store.validation_status : 'disabled'}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-semibold ${diagnosticTone(diagnostic?.status)}`}>
                          <DiagnosticIcon status={diagnostic?.status} />
                          {diagnosticsLoading ? '…' : diagnostic?.label ?? 'Unknown'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          {store.total_products?.toLocaleString?.() ?? 0} products
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          {store.scrape_strategy}
                        </span>
                        {store.requires_auth && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning inline-flex items-center gap-1 font-semibold">
                            {authIcon} Auth
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="px-5 pb-3 space-y-1">
                      <div className="grid grid-cols-2 gap-x-4 text-[10.5px]">
                        <span className="text-muted-foreground">Auth status</span>
                        <span className="text-foreground font-medium truncate">{store.auth_status}</span>
                        <span className="text-muted-foreground">Last scraped</span>
                        <span className="text-foreground font-medium">
                          {store.last_scraped_at ? new Date(store.last_scraped_at).toLocaleDateString() : 'Never'}
                        </span>
                        {diagnostic?.reason && (
                          <>
                            <span className="text-muted-foreground">Reason</span>
                            <span className="text-foreground truncate">{diagnostic.reason}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="px-4 py-3 border-t border-border/50 flex items-center gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 text-[11px] rounded-full flex-1"
                        onClick={() => revalidateStores.mutate([store])}
                        disabled={revalidateStores.isPending}>
                        Revalidate
                      </Button>
                      <Button size="sm" className="h-7 text-[11px] rounded-full flex-1 bg-foreground hover:bg-foreground/90 text-background font-semibold"
                        onClick={() => scrapeStores.mutate({ storeIds: [store.id], modeLabel: 'Store scrape' })}
                        disabled={scrapeStores.isPending}>
                        Scrape now
                      </Button>
                      <Button asChild variant="ghost" size="sm" className="h-7 text-[11px] rounded-full text-muted-foreground">
                        <Link to={`/diagnostics?store=${store.id}`}>Diag</Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* List view */}
          {view === 'list' && (
            <div className="card-surface overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    {['', 'Store', 'Status', 'Diagnostic', 'Products', 'Strategy', 'Auth', 'Last Scraped', 'Actions'].map(h => (
                      <th key={h} className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading && Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-3 w-full" /></td>
                      ))}
                    </tr>
                  ))}
                  {!isLoading && filteredStores.map(store => {
                    const diagnostic = diagnostics?.[store.id];
                    return (
                      <tr key={store.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 w-8">
                          <input type="checkbox" checked={selected.includes(store.id)}
                            onChange={() => toggleSelected(store.id)} className="accent-primary cursor-pointer" />
                        </td>
                        <td className="px-4 py-3 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${healthDot(diagnostic?.status, store.enabled)}`} />
                            <div className="min-w-0">
                              <Link to={`/stores/${store.id}`} className="font-semibold text-foreground hover:text-primary transition-colors truncate block">{store.name}</Link>
                              <p className="text-[10px] text-muted-foreground truncate">{store.normalized_url}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusTone(store.validation_status, store.enabled)}`}>
                            {store.enabled ? store.validation_status : 'disabled'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-semibold ${diagnosticTone(diagnostic?.status)}`}>
                            <DiagnosticIcon status={diagnostic?.status} />
                            {diagnosticsLoading ? '…' : diagnostic?.label ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{store.total_products?.toLocaleString?.() ?? 0}</td>
                        <td className="px-4 py-3 text-muted-foreground">{store.scrape_strategy}</td>
                        <td className="px-4 py-3">
                          {store.requires_auth
                            ? <span className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded-full font-semibold">Required</span>
                            : <span className="text-[10px] text-muted-foreground">None</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {store.last_scraped_at ? new Date(store.last_scraped_at).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="h-6 text-[10px] rounded-full px-2"
                              onClick={() => revalidateStores.mutate([store])} disabled={revalidateStores.isPending}>
                              Revalidate
                            </Button>
                            <Button size="sm" className="h-6 text-[10px] rounded-full px-2 bg-foreground hover:bg-foreground/90 text-background"
                              onClick={() => scrapeStores.mutate({ storeIds: [store.id], modeLabel: 'Store scrape' })}
                              disabled={scrapeStores.isPending}>
                              Scrape
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filteredStores.length === 0 && (
            <div className="bg-white rounded-[28px] border border-dashed border-border p-16 text-center">
              <StoreIcon className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-[13px] font-semibold text-foreground mb-1">
                {search ? 'No stores match your search' : 'No stores yet'}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {search ? 'Try a different search term.' : 'Use "Seed starter library" in the sidebar to add stores.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
