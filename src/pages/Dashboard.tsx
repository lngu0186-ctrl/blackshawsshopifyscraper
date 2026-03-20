import { ScrapeControl } from '@/components/ScrapeControl';
import { useStores } from '@/hooks/useStores';
import { useAuth } from '@/hooks/useAuth';
import { Store, Package, TrendingDown, Clock, Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/url';
import { Link } from 'react-router-dom';

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stores, isLoading } = useStores();

  const totalProducts = stores?.reduce((s, st) => s + st.total_products, 0) ?? 0;
  const enabledCount = stores?.filter(s => s.enabled).length ?? 0;
  const lastScraped = stores?.filter(s => s.last_scraped_at).sort((a, b) => new Date(b.last_scraped_at!).getTime() - new Date(a.last_scraped_at!).getTime())[0];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage and monitor your AU pharmacy store library</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Store} label="Total Stores" value={stores?.length ?? 0} sub={`${enabledCount} enabled`} />
        <StatCard icon={Package} label="Total Products" value={totalProducts.toLocaleString()} />
        <StatCard icon={TrendingDown} label="Price Changes" value="—" sub="Run a scrape to track" />
        <StatCard icon={Clock} label="Last Scraped" value={lastScraped ? new Date(lastScraped.last_scraped_at!).toLocaleDateString() : '—'} sub={lastScraped?.name} />
      </div>

      <ScrapeControl />

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && stores && stores.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Store Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stores.map(store => (
              <Link key={store.id} to={`/stores/${store.id}`}>
                <div className="rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:bg-card/80 transition-all group shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">{store.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{store.normalized_url}</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${store.enabled ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span>{store.total_products.toLocaleString()} products</span>
                    {store.last_scraped_at && <span>{new Date(store.last_scraped_at).toLocaleDateString()}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
