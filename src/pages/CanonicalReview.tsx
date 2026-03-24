import { useMemo, useState } from 'react';
import { CheckCircle2, GitMerge, Info, Search, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCanonicalMatchQueue, useCanonicalReviewActions } from '@/hooks/useCanonicalMatches';

function confidenceTone(score: number) {
  if (score >= 90) return 'bg-success/10 text-success border-success/30';
  if (score >= 75) return 'bg-primary/10 text-primary border-primary/30';
  if (score >= 60) return 'bg-warning/10 text-warning border-warning/30';
  return 'bg-destructive/10 text-destructive border-destructive/30';
}

function confidenceExplanation(row: any) {
  const cp = row.canonical_products;
  const sr = row.product_source_records;
  const reasons: string[] = [];

  if (row.match_method === 'barcode') {
    reasons.push('barcode match');
    if (cp?.canonical_barcode && sr?.barcode && cp.canonical_barcode === sr.barcode) {
      reasons.push('identical barcode on canonical and source');
    }
  }
  if (row.match_method === 'title_brand') {
    reasons.push('title + brand heuristic');
    if (cp?.canonical_brand && sr?.vendor && cp.canonical_brand.toLowerCase() === sr.vendor.toLowerCase()) {
      reasons.push('brand/vendor aligned');
    }
  }
  if (sr?.sku) reasons.push('source has SKU for secondary verification');
  if (!sr?.barcode) reasons.push('no source barcode, so match is less certain');
  if (!cp?.canonical_barcode) reasons.push('canonical barcode missing, needs review');

  return reasons.join(' · ');
}

export default function CanonicalReview() {
  const { data, isLoading } = useCanonicalMatchQueue();
  const review = useCanonicalReviewActions();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

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

  const toggleOne = (id: string) => {
    setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  };

  const toggleAll = () => {
    setSelected(current => current.length === rows.length ? [] : rows.map((row: any) => row.id));
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Canonical Review</h1>
          <p className="text-sm text-muted-foreground">Review junction-table matches between canonical products and current source records.</p>
        </div>
        <Badge variant="outline" className="text-xs">{rows.length} pending/rejected matches</Badge>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-md flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, brand, barcode, source…" className="pl-9" />
        </div>
        <Button variant="outline" size="sm" onClick={toggleAll} disabled={!rows.length}>
          {selected.length === rows.length && selected.length > 0 ? 'Clear selection' : 'Select all'}
        </Button>
        <Button size="sm" onClick={() => review.mutate({ ids: selected, decision: 'accepted' })} disabled={!selected.length || review.isPending}>
          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Accept selected
        </Button>
        <Button size="sm" variant="outline" onClick={() => review.mutate({ ids: selected, decision: 'rejected' })} disabled={!selected.length || review.isPending}>
          <XCircle className="w-3.5 h-3.5 mr-1.5" /> Reject selected
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-2 text-foreground font-medium">
          <Info className="w-3.5 h-3.5 text-primary" /> Confidence guide
        </div>
        <p><strong>90–100</strong>: highly likely, usually barcode-backed</p>
        <p><strong>75–89</strong>: strong heuristic match, often title + brand aligned</p>
        <p><strong>60–74</strong>: review carefully — probable but missing a hard anchor</p>
        <p><strong>&lt;60</strong>: weak match, usually reject unless manually verified</p>
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
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={() => toggleOne(row.id)}
                    aria-label={`Select ${cp?.title || row.id}`}
                  />
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <GitMerge className="w-4 h-4 text-primary" />
                    <h2 className="font-semibold truncate">{cp?.title || 'Untitled canonical product'}</h2>
                    <Badge variant="outline" className="text-[10px]">{row.match_method}</Badge>
                    <span className={`text-[10px] px-2 py-1 rounded-full border ${confidenceTone(row.confidence_score)}`}>
                      confidence {row.confidence_score}
                    </span>
                  </div>
                </div>
                <Badge variant={row.decision === 'rejected' ? 'destructive' : 'secondary'} className="text-[10px]">
                  {row.decision}
                </Badge>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Why this scored this way:</span> {confidenceExplanation(row)}
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
                <Button size="sm" onClick={() => review.mutate({ ids: [row.id], decision: 'accepted' })} disabled={review.isPending}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Accept match
                </Button>
                <Button size="sm" variant="outline" onClick={() => review.mutate({ ids: [row.id], decision: 'rejected' })} disabled={review.isPending}>
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
