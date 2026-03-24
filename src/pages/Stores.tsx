import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ExternalLink, Lock, RefreshCcw, ShieldAlert, Store as StoreIcon, XCircle } from 'lucide-react';
import { useStores } from '@/hooks/useStores';
import { useStoreDiagnostics } from '@/hooks/useStoreDiagnostics';
import { useRevalidateStores, useScrapeStores } from '@/hooks/useStoreActions';
import { Button } from '@/components/ui/button';
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
    case 'productive':
      return 'bg-success/10 text-success';
    case 'stale':
    case 'zero_products':
    case 'auth_required':
      return 'bg-warning/10 text-warning';
    case 'blocked':
    case 'failing':
    case 'invalid':
      return 'bg-destructive/10 text-destructive';
    case 'disabled':
    case 'never_scraped':
    case 'unknown':
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function DiagnosticIcon({ status }: { status?: string }) {
  if (status === 'productive') return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (status === 'blocked' || status === 'failing' || status === 'invalid') return <XCircle className="w-3.5 h-3.5" />;
  return <AlertTriangle className="w-3.5 h-3.5" />;
}

export default function Stores() {
  const { data: stores, isLoading } = useStores();
  const { data: diagnostics, isLoading: diagnosticsLoading } = useStoreDiagnostics(stores);
  const revalidateStores = useRevalidateStores();
  const scrapeStores = useScrapeStores();
  const [selected, setSelected] = useState<string[]>([]);

  const selectedStores = useMemo(
    () => (stores ?? []).filter(store => selected.includes(store.id)),
    [stores, selected]
  );

  const toggleSelected = (storeId: string) => {
    setSelected(current => current.includes(storeId) ? current.filter(id => id !== storeId) : [...current, storeId]);
  };

  const toggleSelectAll = () => {
    if (!stores?.length) return;
    setSelected(current => current.length === stores.length ? [] : stores.map(store => store.id));
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Stores</h1>
          <p className="text-sm text-muted-foreground">
            Source stores, truthful scrape diagnostics, auth blockers, and current product counts.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={toggleSelectAll} disabled={isLoading || !(stores?.length)}>
            {selected.length === (stores?.length ?? 0) && selected.length > 0 ? 'Clear selection' : 'Select all'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => revalidateStores.mutate(selectedStores)}
            disabled={!selectedStores.length || revalidateStores.isPending}
          >
            <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
            Revalidate selected
          </Button>
          <Button
            size="sm"
            onClick={() => scrapeStores.mutate(selectedStores.map(store => store.id))}
            disabled={!selectedStores.length || scrapeStores.isPending}
          >
            Scrape selected
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/diagnostics">Open diagnostics</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-4 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}

        {!isLoading && (stores ?? []).map((store) => {
          const authIcon = store.requires_auth
            ? store.auth_type === 'customer_account'
              ? <ShieldAlert className="w-3.5 h-3.5" />
              : <Lock className="w-3.5 h-3.5" />
            : null;
          const diagnostic = diagnostics?.[store.id];

          return (
            <div
              key={store.id}
              className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={selected.includes(store.id)}
                    onChange={() => toggleSelected(store.id)}
                    className="mt-1"
                    aria-label={`Select ${store.name}`}
                  />
                  <Link to={`/stores/${store.id}`} className="min-w-0 block">
                    <div className="flex items-center gap-2 min-w-0">
                      <StoreIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <h2 className="font-semibold truncate">{store.name}</h2>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{store.normalized_url}</p>
                  </Link>
                </div>
                <Link to={`/stores/${store.id}`}>
                  <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${statusTone(store.validation_status, store.enabled)}`}>
                  {store.enabled ? store.validation_status : 'disabled'}
                </span>
                <span className={`text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1 font-medium ${diagnosticTone(diagnostic?.status)}`}>
                  <DiagnosticIcon status={diagnostic?.status} />
                  {diagnosticsLoading ? 'Checking diagnostics…' : diagnostic?.label ?? 'Unknown'}
                </span>
                <span className="text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground">
                  {store.total_products?.toLocaleString?.() ?? 0} products
                </span>
                <span className="text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground">
                  {store.scrape_strategy}
                </span>
                {store.requires_auth && (
                  <span className="text-[11px] px-2 py-1 rounded-full bg-warning/10 text-warning inline-flex items-center gap-1">
                    {authIcon}
                    Auth required
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => revalidateStores.mutate([store])}
                  disabled={revalidateStores.isPending}
                >
                  Revalidate
                </Button>
                <Button
                  size="sm"
                  onClick={() => scrapeStores.mutate([store.id])}
                  disabled={scrapeStores.isPending}
                >
                  Scrape now
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/diagnostics?store=${store.id}`}>Diagnostics</Link>
                </Button>
              </div>

              <div className="mt-4 text-xs text-muted-foreground space-y-1">
                <p>Auth status: <span className="text-foreground">{store.auth_status}</span></p>
                <p>
                  Last scraped:{' '}
                  <span className="text-foreground">
                    {store.last_scraped_at ? new Date(store.last_scraped_at).toLocaleString() : 'Never'}
                  </span>
                </p>
                {diagnostic && (
                  <>
                    <p>
                      Diagnostics: <span className="text-foreground">{diagnostic.reason}</span>
                    </p>
                    <p>
                      Recent issues: <span className="text-foreground">{diagnostic.failuresLast7Days} errors</span>
                      {diagnostic.latestRunStatus && <> · latest run <span className="text-foreground">{diagnostic.latestRunStatus}</span></>}
                    </p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && (stores?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No stores yet.
        </div>
      )}
    </div>
  );
}
