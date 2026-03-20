import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { ScrapeControl } from '@/components/ScrapeControl';
import { useStores } from '@/hooks/useStores';
import { Store, Package, TrendingDown, Clock, ArrowRight, Loader2, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

function StatCard({ icon: Icon, label, value, sub, loading }: {
  icon: any; label: string; value: string | number; sub?: string; loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card animate-fade-in">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20 mt-1" />
      ) : (
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      )}
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stores, isLoading: storesLoading } = useStores();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard_stats', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [productRes, changeRes] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('user_id', user!.id),
        supabase.from('variant_price_history').select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id).eq('price_changed', true),
      ]);
      return {
        totalProducts: productRes.count ?? 0,
        totalChanges: changeRes.count ?? 0,
      };
    },
  });

  const enabledCount = stores?.filter(s => s.enabled).length ?? 0;
  const lastScraped = stores
    ?.filter(s => s.last_scraped_at)
    .sort((a, b) => new Date(b.last_scraped_at!).getTime() - new Date(a.last_scraped_at!).getTime())[0];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Monitor your AU pharmacy store library</p>
        </div>
        {lastScraped && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="w-3 h-3 text-primary" />
            Last scraped: {new Date(lastScraped.last_scraped_at!).toLocaleString()}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Store} label="Stores" value={stores?.length ?? 0} sub={`${enabledCount} enabled`} loading={storesLoading} />
        <StatCard icon={Package} label="Products" value={(stats?.totalProducts ?? 0).toLocaleString()} loading={statsLoading} />
        <StatCard icon={TrendingDown} label="Price Changes" value={(stats?.totalChanges ?? 0).toLocaleString()} loading={statsLoading} />
        <StatCard
          icon={Clock}
          label="Last Scraped"
          value={lastScraped ? new Date(lastScraped.last_scraped_at!).toLocaleDateString() : '—'}
          sub={lastScraped?.name}
          loading={storesLoading}
        />
      </div>

      {/* Scrape control */}
      <ScrapeControl />

      {/* Store grid */}
      {storesLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!storesLoading && stores && stores.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center space-y-3">
          <Store className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium text-foreground">No stores yet</p>
          <p className="text-xs text-muted-foreground">Click "Seed starter library" in the sidebar to add 15 AU pharmacy stores instantly.</p>
        </div>
      )}

      {!storesLoading && stores && stores.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Store Library</h2>
            <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-foreground gap-1" asChild>
              <Link to="/products">All products <ArrowRight className="w-3 h-3" /></Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {stores.map(store => (
              <Link key={store.id} to={`/stores/${store.id}`}>
                <div className="rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/40 hover:bg-card/80 transition-all group shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">{store.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{store.normalized_url.replace('https://', '')}</p>
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                      store.enabled ? 'bg-primary' : 'bg-muted-foreground/40'
                    }`} />
                  </div>
                  <div className="flex items-center gap-3 mt-2.5 text-[10px] text-muted-foreground">
                    <span>{store.total_products.toLocaleString()} products</span>
                    {store.last_scraped_at && (
                      <span>{new Date(store.last_scraped_at).toLocaleDateString()}</span>
                    )}
                    <span className={store.validation_status === 'valid' ? 'text-primary' : 'text-destructive'}>
                      {store.validation_status}
                    </span>
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
