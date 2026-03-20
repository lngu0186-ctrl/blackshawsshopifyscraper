import { useParams } from 'react-router-dom';
import { useStores } from '@/hooks/useStores';
import { useStoreMetricsHistory } from '@/hooks/usePriceHistory';
import { useProducts } from '@/hooks/useProducts';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Package, TrendingDown, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/url';

export default function StoreDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: stores } = useStores();
  const store = stores?.find(s => s.id === id);
  const { data: metrics } = useStoreMetricsHistory(id ?? null);
  const { data: productsData } = useProducts({ page: 1, pageSize: 5, storeId: id, sortBy: 'scraped_at', sortDir: 'desc' });

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

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{store.name}</h1>
          <a href={store.url} target="_blank" rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 mt-1">
            {store.normalized_url} <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${store.enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
          {store.enabled ? 'Enabled' : 'Disabled'}
        </div>
      </div>

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
