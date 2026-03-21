import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { centsToAUD } from '@/lib/cw-import/parser';
import { CWStatusBadge } from './CWStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, ChevronRight } from 'lucide-react';

type MatchFilter = 'all' | 'matched' | 'new' | 'ambiguous' | 'invalid' | 'skipped';

interface CWImportTableProps {
  jobId: string;
  activeFilter: MatchFilter;
  onFilterChange: (f: MatchFilter) => void;
  onRowClick: (row: CWImportRow) => void;
}

export interface CWImportRow {
  id: string;
  row_number: number;
  cw_name: string | null;
  cw_brand: string | null;
  cw_sku: string | null;
  cw_price_cents: number | null;
  cw_rrp_cents: number | null;
  cw_in_stock: boolean | null;
  cw_url: string | null;
  cw_product_id: string | null;
  cw_image_url: string | null;
  cw_category_path: string | null;
  cw_currency: string | null;
  cw_updated_at: string | null;
  cw_source: string | null;
  cw_slug: string | null;
  match_status: string;
  match_method: string | null;
  match_confidence: number | null;
  matched_record_id: string | null;
  candidate_matches: Array<{ id: string; name: string; brand: string | null; cw_sku: string | null; score: number }>;
  validation_errors: Array<{ field: string; message: string; severity: string }>;
  resolution_action: string | null;
  resolved_at: string | null;
}

const FILTER_TABS: { key: MatchFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'matched', label: 'Matched' },
  { key: 'new', label: 'New' },
  { key: 'ambiguous', label: 'Ambiguous' },
  { key: 'invalid', label: 'Invalid' },
  { key: 'skipped', label: 'Skipped' },
];

export function CWImportTable({ jobId, activeFilter, onFilterChange, onRowClick }: CWImportTableProps) {
  const [search, setSearch] = useState('');

  const { data: rows = [], isLoading } = useQuery<CWImportRow[]>({
    queryKey: ['cw-import-rows', jobId, activeFilter],
    queryFn: async () => {
      let q = supabase
        .from('cw_import_rows')
        .select('*')
        .eq('import_job_id', jobId)
        .order('row_number', { ascending: true })
        .limit(1000);

      if (activeFilter !== 'all') q = q.eq('match_status', activeFilter);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CWImportRow[];
    },
    staleTime: 15_000,
  });

  const filtered = search.trim()
    ? rows.filter(r => {
        const q = search.toLowerCase();
        return (
          r.cw_name?.toLowerCase().includes(q) ||
          r.cw_brand?.toLowerCase().includes(q) ||
          r.cw_sku?.toLowerCase().includes(q) ||
          r.cw_product_id?.toLowerCase().includes(q)
        );
      })
    : rows;

  const confidenceColor = (score: number | null) => {
    if (score == null) return 'text-muted-foreground';
    if (score >= 0.9) return 'text-success';
    if (score >= 0.7) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Filter tabs + search */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => onFilterChange(tab.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                activeFilter === tab.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name, SKU, product ID…"
            className="pl-8 h-8 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-10 text-xs">#</TableHead>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Brand</TableHead>
              <TableHead className="text-xs">SKU</TableHead>
              <TableHead className="text-xs text-right">Price</TableHead>
              <TableHead className="text-xs text-right">RRP</TableHead>
              <TableHead className="text-xs">Stock</TableHead>
              <TableHead className="text-xs">Match</TableHead>
              <TableHead className="text-xs text-right">Confidence</TableHead>
              <TableHead className="text-xs">Action</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground text-sm py-8">Loading…</TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground text-sm py-8">No rows match this filter.</TableCell>
              </TableRow>
            )}
            {filtered.map(row => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-muted/30"
                onClick={() => onRowClick(row)}
              >
                <TableCell className="text-xs text-muted-foreground">{row.row_number}</TableCell>
                <TableCell className="text-sm font-medium max-w-[200px] truncate">
                  {row.cw_name ?? <span className="text-muted-foreground italic">—</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.cw_brand ?? '—'}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{row.cw_sku ?? '—'}</TableCell>
                <TableCell className="text-sm text-right tabular-nums">{centsToAUD(row.cw_price_cents)}</TableCell>
                <TableCell className="text-sm text-right tabular-nums text-muted-foreground">{centsToAUD(row.cw_rrp_cents)}</TableCell>
                <TableCell>
                  {row.cw_in_stock == null ? (
                    <span className="text-muted-foreground text-xs">—</span>
                  ) : (
                    <Badge variant="outline" className={`text-[10px] border-0 ${row.cw_in_stock ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
                      {row.cw_in_stock ? 'In Stock' : 'OOS'}
                    </Badge>
                  )}
                </TableCell>
                <TableCell><CWStatusBadge status={row.match_status} /></TableCell>
                <TableCell className={`text-sm text-right tabular-nums ${confidenceColor(row.match_confidence)}`}>
                  {row.match_confidence != null ? `${Math.round(row.match_confidence * 100)}%` : '—'}
                </TableCell>
                <TableCell>
                  {row.resolution_action ? (
                    <Badge variant="outline" className="text-[10px] border-0 bg-muted text-muted-foreground capitalize">
                      {row.resolution_action.replace('_', ' ')}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground px-1">Showing {filtered.length} of {rows.length} rows</p>
    </div>
  );
}
