import { useState } from 'react';
import { usePriceHistory } from '@/hooks/usePriceHistory';
import { useStores } from '@/hooks/useStores';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatPrice } from '@/lib/url';
import type { PriceChangeFilter } from '@/hooks/usePriceHistory';

export default function PriceChanges() {
  const [filter, setFilter] = useState<PriceChangeFilter>({ page: 1, pageSize: 50 });
  const { data, isLoading } = usePriceHistory(filter);
  const { data: stores } = useStores();
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / filter.pageSize);

  function DeltaBadge({ delta }: { delta: number | null }) {
    if (delta == null) return null;
    if (delta > 0) return <Badge className="text-[10px] bg-destructive/20 text-destructive border-0"><TrendingUp className="w-2.5 h-2.5 mr-1" />+${delta.toFixed(2)}</Badge>;
    if (delta < 0) return <Badge className="text-[10px] bg-primary/20 text-primary border-0"><TrendingDown className="w-2.5 h-2.5 mr-1" />${delta.toFixed(2)}</Badge>;
    return <Badge className="text-[10px] bg-muted text-muted-foreground border-0"><Minus className="w-2.5 h-2.5 mr-1" />$0.00</Badge>;
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Price Changes</h1>
        <p className="text-sm text-muted-foreground">{total.toLocaleString()} price change events</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filter.storeId || 'all'} onValueChange={v => setFilter(f => ({ ...f, storeId: v === 'all' ? undefined : v, page: 1 }))}>
          <SelectTrigger className="h-8 text-sm w-44"><SelectValue placeholder="All stores" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stores</SelectItem>
            {stores?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filter.direction || 'any'} onValueChange={v => setFilter(f => ({ ...f, direction: v as any, page: 1 }))}>
          <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Any direction" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any direction</SelectItem>
            <SelectItem value="increase">Increases</SelectItem>
            <SelectItem value="decrease">Decreases</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" className="h-8 text-sm w-36" placeholder="From"
          onChange={e => setFilter(f => ({ ...f, dateFrom: e.target.value || undefined, page: 1 }))} />
        <Input type="date" className="h-8 text-sm w-36" placeholder="To"
          onChange={e => setFilter(f => ({ ...f, dateTo: e.target.value || undefined, page: 1 }))} />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Store', 'Product', 'Variant', 'Old Price', 'New Price', 'Δ($)', 'Δ(%)', 'Detected At'].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-muted-foreground px-3 py-2.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                {Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-16" /></td>)}
              </tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-12 text-sm">No price changes yet. Run a scrape to detect changes.</td></tr>
            )}
            {items.map((item: any) => (
              <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.store_handle}</td>
                <td className="px-3 py-2.5 text-xs font-medium max-w-40 truncate">{item.products?.title || '—'}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.variant_title || 'Default'}</td>
                <td className="px-3 py-2.5 text-xs font-mono">{formatPrice(item.previous_price)}</td>
                <td className="px-3 py-2.5 text-xs font-mono">{formatPrice(item.price)}</td>
                <td className="px-3 py-2.5"><DeltaBadge delta={item.price_delta} /></td>
                <td className="px-3 py-2.5 text-xs font-mono">
                  {item.price_delta_pct != null ? `${(item.price_delta_pct * 100).toFixed(1)}%` : '—'}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{new Date(item.recorded_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {filter.page} of {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={filter.page <= 1} onClick={() => setFilter(f => ({ ...f, page: f.page - 1 }))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={filter.page >= totalPages} onClick={() => setFilter(f => ({ ...f, page: f.page + 1 }))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
