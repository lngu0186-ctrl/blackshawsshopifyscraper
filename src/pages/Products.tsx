import { useState } from 'react';
import { useProducts, useProductFilters } from '@/hooks/useProducts';
import { useStores } from '@/hooks/useStores';
import { useExport } from '@/hooks/useExport';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, ChevronLeft, ChevronRight, ExternalLink, ChevronDown, ChevronUp, Download, X } from 'lucide-react';
import { formatPriceRange } from '@/lib/url';
import type { ProductFilter } from '@/types/schemas';
import { ProductRowExpanded } from '@/components/ProductRowExpanded';

const DEFAULT_FILTER: ProductFilter = { page: 1, pageSize: 50, sortBy: 'scraped_at', sortDir: 'desc' };

export default function Products() {
  const [filter, setFilter] = useState<ProductFilter>(DEFAULT_FILTER);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading } = useProducts(filter);
  const { data: filters } = useProductFilters();
  const { data: stores } = useStores();
  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / filter.pageSize);

  const update = (patch: Partial<ProductFilter>) => setFilter(f => ({ ...f, ...patch, page: 1 }));

  const columns = ['Store', 'Title', 'Type', 'Vendor', 'Price', 'Variants', 'Last Changed', 'Actions'];

  return (
    <div className="p-6 space-y-4 max-w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">All Products</h1>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} products across all stores</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search title, vendor, tags…"
            className="pl-8 h-8 text-sm w-60"
            value={filter.search || ''}
            onChange={e => update({ search: e.target.value || undefined })}
          />
        </div>
        <Select value={filter.storeId || 'all'} onValueChange={v => update({ storeId: v === 'all' ? undefined : v })}>
          <SelectTrigger className="h-8 text-sm w-44"><SelectValue placeholder="All stores" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stores</SelectItem>
            {stores?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filter.productType || 'all'} onValueChange={v => update({ productType: v === 'all' ? undefined : v })}>
          <SelectTrigger className="h-8 text-sm w-40"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {filters?.types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filter.vendor || 'all'} onValueChange={v => update({ vendor: v === 'all' ? undefined : v })}>
          <SelectTrigger className="h-8 text-sm w-40"><SelectValue placeholder="All vendors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {filters?.vendors.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant={filter.changedSinceExport ? 'default' : 'outline'}
          size="sm"
          className="h-8 text-xs"
          onClick={() => update({ changedSinceExport: !filter.changedSinceExport })}
        >
          Changed since export
        </Button>
        {(filter.search || filter.storeId || filter.productType || filter.vendor || filter.changedSinceExport) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => setFilter(DEFAULT_FILTER)}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {columns.map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-muted-foreground px-3 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {columns.map((_, j) => (
                    <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-20" /></td>
                  ))}
                </tr>
              ))}
              {!isLoading && products.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="text-center text-muted-foreground py-12 text-sm">
                    No products found. Run a scrape to populate your library.
                  </td>
                </tr>
              )}
              {!isLoading && products.map((product: any) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  isExpanded={expanded === product.id}
                  onToggle={() => setExpanded(expanded === product.id ? null : product.id)}
                  colCount={columns.length}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{((filter.page - 1) * filter.pageSize) + 1}–{Math.min(filter.page * filter.pageSize, total)} of {total.toLocaleString()}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7"
              disabled={filter.page <= 1} onClick={() => setFilter(f => ({ ...f, page: f.page - 1 }))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-2">Page {filter.page} of {totalPages}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              disabled={filter.page >= totalPages} onClick={() => setFilter(f => ({ ...f, page: f.page + 1 }))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductRow({ product, isExpanded, onToggle, colCount }: {
  product: any; isExpanded: boolean; onToggle: () => void; colCount: number;
}) {
  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{product.store_name}</td>
        <td className="px-3 py-2.5 max-w-48">
          <div className="flex items-center gap-2">
            {product.images?.[0]?.src && (
              <img src={product.images[0].src} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 border border-border" />
            )}
            <span className="font-medium text-xs truncate">{product.title}</span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground">{product.product_type || '—'}</td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground">{product.vendor || '—'}</td>
        <td className="px-3 py-2.5 text-xs font-mono">{formatPriceRange(product.price_min, product.price_max)}</td>
        <td className="px-3 py-2.5 text-xs text-center">{product.product_variants?.length ?? 0}</td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground">
          {product.last_changed_at ? new Date(product.last_changed_at).toLocaleDateString() : '—'}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {product.url && (
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            {isExpanded
              ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
              : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-border/50 bg-muted/10">
          <td colSpan={colCount} className="px-4 py-4">
            <ProductRowExpanded product={product} />
          </td>
        </tr>
      )}
    </>
  );
}
