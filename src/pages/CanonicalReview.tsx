import { useMemo, useState } from 'react';
import { CheckCircle2, GitMerge, Search, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCanonicalMatchQueue, useCanonicalReviewActions } from '@/hooks/useCanonicalMatches';

export default function CanonicalReview() {
  const { data, isLoading } = useCanonicalMatchQueue();
  const review = useCanonicalReviewActions();
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((row: any) => {
      if (!q) return true;
      const cp = row.canonical_products;
      const sr = row.product_source_records;
      return [cp?.title, cp?.canonical_brand, cp?.canonical_barcode, sr?.title, sr?.vendor, sr?.barcode, sr?.sku, sr?.source_name]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
  }, [data, search]);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Canonical Review</h1>
          <p className="text-sm text-muted-foreground">Review junction-table matches between canonical products and current source records.</p>
        </div>
        <Badge variant="outline" className="text-xs">{rows.length} pending/rejected matches</Badge>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, brand, barcode, source…" className="pl-9" />
      </div>

      <div className="grid gap-4">
        {isLoading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-4 space-y-3">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}

        {!isLoading && rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No canonical matches need review right now.
          </div>
        )}

        {rows.map((row: any) => {
          const cp = row.canonical_products;
          const sr = row.product_source_records;
          return (
            <div key={row.id} className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <GitMerge className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold">{cp?.title || 'Untitled canonical product'}</h2>
                  <Badge variant="outline" className="text-[10px]">{row.match_method}</Badge>
                  <Badge variant="outline" className="text-[10px]">confidence {row.confidence_score}</Badge>
                </div>
                <Badge variant={row.decision === 'rejected' ? 'destructive' : 'secondary'} className="text-[10px]">
                  {row.decision}
                </Badge>
              </div>

              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Canonical</p>
                  <p><span className="text-muted-foreground">Brand:</span> {cp?.canonical_brand || '—'}</p>
                  <p><span className="text-muted-foreground">Barcode:</span> {cp?.canonical_barcode || '—'}</p>
                  <p><span className="text-muted-foreground">Type:</span> {cp?.product_type || '—'}</p>
                  <p><span className="text-muted-foreground">Status:</span> {cp?.match_status || '—'}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Source record</p>
                  <p><span className="text-muted-foreground">Title:</span> {sr?.title || '—'}</p>
                  <p><span className="text-muted-foreground">Vendor:</span> {sr?.vendor || '—'}</p>
                  <p><span className="text-muted-foreground">Barcode:</span> {sr?.barcode || '—'}</p>
                  <p><span className="text-muted-foreground">SKU:</span> {sr?.sku || '—'}</p>
                  <p><span className="text-muted-foreground">Source:</span> {sr?.source_name || sr?.source_kind || '—'}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={() => review.mutate({ id: row.id, decision: 'accepted' })} disabled={review.isPending}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Accept match
                </Button>
                <Button size="sm" variant="outline" onClick={() => review.mutate({ id: row.id, decision: 'rejected' })} disabled={review.isPending}>
                  <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject match
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
