import { useState, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useProducts, useProductFilters } from '@/hooks/useProducts';
import { useStores } from '@/hooks/useStores';
import { useExport } from '@/hooks/useExport';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Search, ChevronLeft, ChevronRight, ExternalLink, Download,
  X, Loader2, SlidersHorizontal, Columns, ChevronDown, ChevronUp,
  ArrowUpDown, ArrowUp, ArrowDown, Lock, Check, AlertTriangle,
} from 'lucide-react';
import { formatPriceRange } from '@/lib/url';
import type { ProductFilter } from '@/types/schemas';
import { ProductDetailDrawer } from '@/components/ProductDetailDrawer';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { exportShopifyReadyCsv, exportReviewRequiredCsv, serializeCsv, SHOPIFY_CSV_HEADERS, buildShopifyRowFromScrapedProduct } from '@/lib/csvExport';

const DEFAULT_FILTER: ProductFilter = { page: 1, pageSize: 50, sortBy: 'scraped_at', sortDir: 'desc' };

const ALL_COLUMNS = ['Store', 'Title', 'Vendor', 'Type', 'Price', 'Variants', 'Barcode', 'Confidence', 'Status', 'Last Changed', 'Actions'] as const;
const DEFAULT_VISIBLE = new Set(['Store', 'Title', 'Vendor', 'Price', 'Variants', 'Barcode', 'Confidence', 'Status', 'Last Changed', 'Actions']);

type ColName = typeof ALL_COLUMNS[number];

const SORTABLE: Partial<Record<ColName, string>> = {
  Store: 'store_name',
  Title: 'title',
  Vendor: 'vendor',
  Type: 'product_type',
  Price: 'price_min',
  Variants: 'product_variants',
  'Last Changed': 'last_changed_at',
};

export default function Products() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const initialFilter: ProductFilter = {
    ...DEFAULT_FILTER,
    ...(searchParams.get('auth_blocked') === '1' ? { authBlocked: true } : {}),
    ...(searchParams.get('review_status') ? { reviewStatus: searchParams.get('review_status')! } : {}),
  };

  const [filter, setFilter] = useState<ProductFilter>(initialFilter);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(DEFAULT_VISIBLE));
  const [drawerProduct, setDrawerProduct] = useState<any | null>(null);
  const [exportConfirm, setExportConfirm] = useState<{ mode: string; count: number } | null>(null);

  const { data, isLoading } = useProducts(filter);
  const { data: filterOptions } = useProductFilters();
  const { data: stores } = useStores();
  const { exportShopifyCsv } = useExport();

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / filter.pageSize);

  const update = (patch: Partial<ProductFilter>) => setFilter(f => ({ ...f, ...patch, page: 1 }));

  // Toggle sort
  const toggleSort = (col: ColName) => {
    const col_key = SORTABLE[col];
    if (!col_key) return;
    setFilter(f => ({
      ...f,
      sortBy: col_key,
      sortDir: f.sortBy === col_key ? (f.sortDir === 'asc' ? 'desc' : 'asc') : 'desc',
      page: 1,
    }));
  };

  const getSortIcon = (col: ColName) => {
    const col_key = SORTABLE[col];
    if (!col_key) return <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />;
    if (filter.sortBy !== col_key) return <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />;
    return filter.sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-primary" />
      : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  // Selection
  const pageIds = useMemo(() => products.map((p: any) => p.id), [products]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id: string) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id: string) => selectedIds.has(id));
  const toggleAll = () => setSelectedIds(prev => {
    const next = new Set(prev);
    if (allPageSelected) pageIds.forEach((id: string) => next.delete(id));
    else pageIds.forEach((id: string) => next.add(id));
    return next;
  });
  const toggleOne = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  // Active filter chips
  const activeFilters: Array<{ key: string; label: string }> = [
    filter.storeId && { key: 'storeId', label: `Store: ${stores?.find(s => s.id === filter.storeId)?.name ?? filter.storeId}` },
    filter.productType && { key: 'productType', label: `Type: ${filter.productType}` },
    filter.vendor && { key: 'vendor', label: `Vendor: ${filter.vendor}` },
    (filter as any).reviewStatus && { key: 'reviewStatus', label: `Review: ${(filter as any).reviewStatus}` },
    (filter as any).missingField && { key: 'missingField', label: `Missing: ${(filter as any).missingField}` },
    (filter as any).authBlocked && { key: 'authBlocked', label: 'Auth Blocked' },
    filter.changedSinceExport && { key: 'changedSinceExport', label: 'Changed since export' },
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  const removeFilter = (key: string) => update({ [key]: undefined } as any);
  const clearFilters = () => setFilter(DEFAULT_FILTER);

  // Bulk actions
  const bulkUpdateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      await supabase.from('scraped_products')
        .update({ review_status: status, is_approved: status === 'approved' })
        .in('id', ids)
        .eq('user_id', user!.id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); toast.success('Updated'); },
  });

  // Export all filtered rows (paginated)
  const exportAllFiltered = async (mode: 'shopify_csv' | 'review_csv') => {
    if (!user) return;
    let allProducts: any[] = [];
    let page = 1;
    while (true) {
      const { products: batch } = await fetchProductPage({ ...filter, page, pageSize: 500 }, user.id);
      allProducts = [...allProducts, ...batch];
      if (batch.length < 500) break;
      page++;
    }
    if (mode === 'shopify_csv') exportShopifyReadyCsv(allProducts);
    else exportReviewRequiredCsv(allProducts);
  };

  const visibleColsArr = ALL_COLUMNS.filter(c => visibleCols.has(c));
  const colCount = visibleColsArr.length + 1; // +1 for checkbox

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* ── Top Bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border bg-white flex-shrink-0">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight text-foreground leading-none">All Products</h1>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">{total.toLocaleString()} products across all stores</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <span className="text-[11px] text-muted-foreground">{selectedIds.size} selected</span>
          )}
          {selectedIds.size > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[12px] rounded-xl gap-1.5">
                  Bulk Actions <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-xs" onClick={() => bulkUpdateStatus.mutate({ ids: Array.from(selectedIds), status: 'approved' })}>
                  <Check className="w-3 h-3 mr-1.5" /> Mark as Approved
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onClick={() => bulkUpdateStatus.mutate({ ids: Array.from(selectedIds), status: 'needs_review' })}>
                  <AlertTriangle className="w-3 h-3 mr-1.5" /> Mark as Needs Review
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-xs" onClick={() => exportShopifyCsv.mutate({ productIds: Array.from(selectedIds) })}>
                  <Download className="w-3 h-3 mr-1.5" /> Export selected (Shopify CSV)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 text-[12px] rounded-xl gap-1.5 bg-foreground hover:bg-foreground/90 text-background font-semibold">
                <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl">
              <DropdownMenuLabel className="text-xs">Shopify CSV</DropdownMenuLabel>
              <DropdownMenuItem className="text-xs" onClick={() => exportShopifyCsv.mutate({ productIds: products.map((p: any) => p.id) })}>
                Export visible rows ({products.length})
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onClick={() => exportAllFiltered('shopify_csv')}>
                Export all filtered ({total.toLocaleString()})
              </DropdownMenuItem>
              {selectedIds.size > 0 && (
                <DropdownMenuItem className="text-xs" onClick={() => exportShopifyCsv.mutate({ productIds: Array.from(selectedIds) })}>
                  Export selected ({selectedIds.size})
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs" onClick={() => exportAllFiltered('review_csv')}>
                Export Review Required → CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

        {/* Filters */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-[12px] rounded-xl gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {activeFilters.length > 0 && (
                <span className="bg-primary text-primary-foreground text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                  {activeFilters.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60 rounded-xl" align="start">
            <DropdownMenuLabel className="text-xs">Source</DropdownMenuLabel>
            {stores?.map(s => (
              <DropdownMenuCheckboxItem key={s.id} checked={filter.storeId === s.id}
                onCheckedChange={v => update({ storeId: v ? s.id : undefined })} className="text-xs">
                {s.name}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Review Status</DropdownMenuLabel>
            {['pending', 'approved', 'needs_review', 'rejected'].map(s => (
              <DropdownMenuCheckboxItem key={s} checked={(filter as any).reviewStatus === s}
                onCheckedChange={v => update({ reviewStatus: v ? s : undefined } as any)} className="text-xs capitalize">
                {s.replace('_', ' ')}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Missing Field</DropdownMenuLabel>
            {['price', 'image_url', 'description_html', 'barcode'].map(f => (
              <DropdownMenuCheckboxItem key={f} checked={(filter as any).missingField === f}
                onCheckedChange={v => update({ missingField: v ? f : undefined } as any)} className="text-xs">
                {f}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={!!(filter as any).authBlocked}
              onCheckedChange={v => update({ authBlocked: v || undefined } as any)} className="text-xs">
              🔐 Auth Blocked only
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={!!filter.changedSinceExport}
              onCheckedChange={v => update({ changedSinceExport: v || undefined })} className="text-xs">
              Changed since export
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Columns */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-[12px] rounded-xl gap-1.5">
              <Columns className="w-3.5 h-3.5" /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="rounded-xl">
            {ALL_COLUMNS.map(col => (
              <DropdownMenuCheckboxItem key={col} checked={visibleCols.has(col)}
                onCheckedChange={v => {
                  setVisibleCols(prev => { const n = new Set(prev); v ? n.add(col) : n.delete(col); return n; });
                }} className="text-xs">
                {col}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Active filter chips */}
        {activeFilters.map(f => (
          <span key={f.key} className="flex items-center gap-1 text-[11px] bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
            {f.label}
            <button onClick={() => removeFilter(f.key)} className="hover:text-destructive transition-colors">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        {activeFilters.length > 0 && (
          <button onClick={clearFilters} className="text-[11px] text-muted-foreground hover:text-foreground underline">
            Clear all
          </button>
        )}

        <span className="ml-auto text-[11px] text-muted-foreground">
          Showing {products.length.toLocaleString()} of {total.toLocaleString()}
        </span>
      </div>

      {/* ── Table ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-3 py-2.5 w-8">
                      <Checkbox
                        checked={allPageSelected}
                        data-state={somePageSelected && !allPageSelected ? 'indeterminate' : undefined}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                        className="block"
                      />
                    </th>
                    {visibleColsArr.map(col => (
                      <th
                        key={col}
                        className={`text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2.5 whitespace-nowrap group ${SORTABLE[col] ? 'cursor-pointer select-none hover:text-foreground transition-colors' : ''}`}
                        onClick={() => SORTABLE[col] && toggleSort(col)}
                      >
                        <span className="flex items-center gap-1.5">
                          {col}
                          {SORTABLE[col] && getSortIcon(col)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading && Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: colCount }).map((_, j) => (
                        <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))}
                  {!isLoading && products.length === 0 && (
                    <tr>
                      <td colSpan={colCount} className="text-center text-muted-foreground py-16 text-[13px]">
                        No products found. Run a scrape to populate your library.
                      </td>
                    </tr>
                  )}
                  {!isLoading && products.map((product: any) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      isSelected={selectedIds.has(product.id)}
                      visibleCols={visibleCols}
                      onToggleSelect={() => toggleOne(product.id)}
                      onOpenDrawer={() => setDrawerProduct(product)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-[12px] text-muted-foreground">
              <span>{((filter.page - 1) * filter.pageSize) + 1}–{Math.min(filter.page * filter.pageSize, total)} of {total.toLocaleString()}</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-lg"
                  disabled={filter.page <= 1} onClick={() => setFilter(f => ({ ...f, page: f.page - 1 }))}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="px-3">Page {filter.page} of {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-lg"
                  disabled={filter.page >= totalPages} onClick={() => setFilter(f => ({ ...f, page: f.page + 1 }))}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product detail drawer */}
      <ProductDetailDrawer
        product={drawerProduct}
        open={!!drawerProduct}
        onClose={() => setDrawerProduct(null)}
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function fetchProductPage(filter: ProductFilter, userId: string) {
  let query = supabase
    .from('scraped_products')
    .select('*', { count: 'exact' })
    .eq('user_id', userId);
  if ((filter as any).authBlocked) query = query.eq('auth_blocked', true);
  const from = ((filter.page || 1) - 1) * (filter.pageSize || 500);
  const to = from + (filter.pageSize || 500) - 1;
  query = query.range(from, to);
  const { data } = await query;
  return { products: data ?? [] };
}

function confidenceTier(score: number): { label: string; cls: string } {
  if (score >= 90) return { label: 'Ready', cls: 'bg-success/15 text-success' };
  if (score >= 60) return { label: 'Review', cls: 'bg-warning/15 text-warning' };
  return { label: 'Partial', cls: 'bg-destructive/15 text-destructive' };
}

// ── Product Row ────────────────────────────────────────────────────────────────
function ProductRow({
  product, isSelected, visibleCols, onToggleSelect, onOpenDrawer,
}: {
  product: any;
  isSelected: boolean;
  visibleCols: Set<string>;
  onToggleSelect: () => void;
  onOpenDrawer: () => void;
}) {
  const overrides = (product.override_fields as Record<string, unknown>) ?? {};
  const getVal = (field: string) => (field in overrides ? String(overrides[field] ?? '') : product[field]);

  const renderCell = (col: string) => {
    switch (col) {
      case 'Store': return <span className="text-xs text-muted-foreground whitespace-nowrap">{product.store_name ?? '—'}</span>;
      case 'Title': return (
        <div className="flex items-center gap-2 max-w-52">
          {product.image_url && <img src={product.image_url} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0 border border-border" />}
          <span className="text-xs font-medium truncate">{getVal('title') || '—'}</span>
        </div>
      );
      case 'Vendor': return <span className="text-xs text-muted-foreground">{getVal('brand') || product.vendor || '—'}</span>;
      case 'Type': return <span className="text-xs text-muted-foreground">{product.category || product.product_type || '—'}</span>;
      case 'Price': return (
        <div className="flex items-center gap-1">
          {product.auth_blocked && <span title="Auth blocked"><Lock className="w-3 h-3 text-warning flex-shrink-0" /></span>}
          <span className="text-xs font-mono">
            {product.price != null ? `$${Number(product.price).toFixed(2)}` : formatPriceRange(product.price_min, product.price_max)}
          </span>
        </div>
      );
      case 'Variants': return <span className="text-xs text-center">{product.product_variants?.length ?? 0}</span>;
      case 'Barcode': return (
        <span className="text-xs font-mono text-muted-foreground">{getVal('barcode') || product.gtin || '—'}</span>
      );
      case 'Confidence': {
        const score = product.confidence_score ?? 0;
        const tier = confidenceTier(score);
        return (
          <div className="flex items-center gap-1.5">
            <div className="w-12 bg-muted rounded-full h-1.5 flex-shrink-0">
              <div className={`h-full rounded-full ${score >= 90 ? 'bg-success' : score >= 60 ? 'bg-warning' : 'bg-destructive'}`}
                style={{ width: `${score}%` }} />
            </div>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${tier.cls}`}>{score}</span>
          </div>
        );
      }
      case 'Status': return (
        <div className="flex items-center gap-1">
          {product.auth_blocked && (
            <span title="Price hidden — store requires login" className="text-[9px] bg-warning/10 text-warning px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5">
              <Lock className="w-2.5 h-2.5" /> Blocked
            </span>
          )}
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
            product.review_status === 'approved' ? 'bg-success/15 text-success' :
            product.review_status === 'needs_review' ? 'bg-warning/15 text-warning' :
            product.review_status === 'rejected' ? 'bg-destructive/15 text-destructive' :
            'bg-muted text-muted-foreground'
          }`}>
            {product.review_status ?? 'pending'}
          </span>
        </div>
      );
      case 'Last Changed': return (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {product.scraped_at ? new Date(product.scraped_at).toLocaleDateString() : product.last_changed_at ? new Date(product.last_changed_at).toLocaleDateString() : '—'}
        </span>
      );
      case 'Actions': return (
        <div className="flex items-center gap-1.5">
          {(product.source_url || product.url) && (
            <a
              href={product.source_url || product.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      );
      default: return null;
    }
  };

  return (
    <tr
      className={`border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
      onClick={onOpenDrawer}
    >
      <td className="px-3 py-2.5 w-8" onClick={e => { e.stopPropagation(); onToggleSelect(); }}>
        <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} aria-label="Select" className="block" />
      </td>
      {ALL_COLUMNS.filter(c => visibleCols.has(c)).map(col => (
        <td key={col} className="px-3 py-2.5">
          {renderCell(col)}
        </td>
      ))}
    </tr>
  );
}
