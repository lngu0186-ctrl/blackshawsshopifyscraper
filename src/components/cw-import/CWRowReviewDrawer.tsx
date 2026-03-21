import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { centsToAUD } from '@/lib/cw-import/parser';
import { CWStatusBadge } from './CWStatusBadge';
import type { CWImportRow } from './CWImportTable';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ExternalLink, AlertTriangle, CheckCircle2, SkipForward, Link2 } from 'lucide-react';
import { toast } from 'sonner';

interface CWRowReviewDrawerProps {
  row: CWImportRow | null;
  open: boolean;
  onClose: () => void;
  jobId: string;
}

function FieldRow({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  const display = value == null || value === '' ? <span className="text-muted-foreground italic">—</span> : String(value);
  return (
    <div className="flex gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="w-36 text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium break-all">{display}</span>
    </div>
  );
}

export function CWRowReviewDrawer({ row, open, onClose, jobId }: CWRowReviewDrawerProps) {
  const queryClient = useQueryClient();
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  const resolve = useMutation({
    mutationFn: async (payload: {
      rowId: string;
      resolution_action: 'update' | 'create' | 'skip' | 'manual_link';
      matched_record_id?: string | null;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-cw-row`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Unknown error');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cw-import-rows', jobId] });
      queryClient.invalidateQueries({ queryKey: ['cw-import-job', jobId] });
      onClose();
      toast.success('Row updated');
    },
    onError: (e) => toast.error(e.message),
  });

  if (!row) return null;

  const handleAction = (action: 'update' | 'create' | 'skip' | 'manual_link') => {
    resolve.mutate({
      rowId: row.id,
      resolution_action: action,
      matched_record_id:
        action === 'manual_link' ? (selectedCandidateId ?? row.matched_record_id)
        : action === 'update' ? row.matched_record_id
        : null,
    });
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-[540px] sm:max-w-[540px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-base leading-snug line-clamp-2">{row.cw_name ?? 'Row Review'}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <CWStatusBadge status={row.match_status} />
            {row.cw_brand && <span className="text-xs text-muted-foreground">{row.cw_brand}</span>}
          </SheetDescription>
        </SheetHeader>

        {/* ── Imported Data ─────────────────────────────────────────────── */}
        <section className="mb-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Imported Data</p>
          <div className="bg-muted/40 rounded-lg px-3 py-2">
            <FieldRow label="Name" value={row.cw_name} />
            <FieldRow label="Brand" value={row.cw_brand} />
            <FieldRow label="SKU" value={row.cw_sku} />
            <FieldRow label="Product ID" value={row.cw_product_id} />
            <FieldRow label="Price (AUD)" value={`${centsToAUD(row.cw_price_cents)}  (raw: ${row.cw_price_cents ?? '—'} cents)`} />
            <FieldRow label="RRP (AUD)" value={row.cw_rrp_cents != null ? `${centsToAUD(row.cw_rrp_cents)}  (raw: ${row.cw_rrp_cents} cents)` : null} />
            <FieldRow label="In Stock" value={row.cw_in_stock == null ? null : row.cw_in_stock ? 'Yes' : 'No'} />
            <FieldRow label="Currency" value={row.cw_currency} />
            <FieldRow label="Category" value={row.cw_category_path} />
            <FieldRow label="Source" value={row.cw_source} />
            <FieldRow label="Updated At" value={row.cw_updated_at} />
            {row.cw_url && (
              <div className="flex gap-2 py-1.5">
                <span className="w-36 text-xs text-muted-foreground shrink-0">URL</span>
                <a href={row.cw_url} target="_blank" rel="noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1 truncate"
                  onClick={e => e.stopPropagation()}>
                  {row.cw_url} <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            )}
            {row.cw_image_url && (
              <div className="pt-2">
                <img src={row.cw_image_url} alt="Product" className="h-20 w-20 object-contain rounded-md border bg-white" />
              </div>
            )}
          </div>
        </section>

        {/* ── Validation Errors ─────────────────────────────────────────── */}
        {row.validation_errors?.length > 0 && (
          <section className="mb-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Validation Errors</p>
            <div className="space-y-1.5">
              {row.validation_errors.map((e, i) => (
                <div key={i} className={`flex items-start gap-2 text-xs p-2 rounded-md ${e.severity === 'error' ? 'bg-destructive/10' : 'bg-warning/10'}`}>
                  <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${e.severity === 'error' ? 'text-destructive' : 'text-warning'}`} />
                  <span><span className="font-medium">{e.field}:</span> {e.message}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Match Candidates ──────────────────────────────────────────── */}
        {row.candidate_matches?.length > 0 && (
          <section className="mb-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Match Candidates ({row.match_method && <span className="normal-case font-normal text-muted-foreground">{row.match_method}</span>})
            </p>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Brand</TableHead>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs text-right">Score</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.candidate_matches.map((c, i) => {
                  const isSelected = selectedCandidateId === c.id || (!selectedCandidateId && i === 0);
                  return (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                      onClick={() => setSelectedCandidateId(c.id)}
                    >
                      <TableCell className={`text-sm ${i === 0 ? 'font-medium' : ''}`}>{c.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.brand ?? '—'}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{c.cw_sku ?? '—'}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums">{Math.round(c.score * 100)}%</TableCell>
                      <TableCell>{isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        )}

        <Separator className="my-4" />

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Actions</p>
          <div className="flex flex-col gap-2">
            {(row.match_status === 'matched' || row.match_status === 'ambiguous') && (
              <Button
                variant="default"
                size="sm"
                className="justify-start gap-2"
                disabled={resolve.isPending}
                onClick={() => handleAction(
                  selectedCandidateId || row.match_status === 'ambiguous' ? 'manual_link' : 'update'
                )}
              >
                <Link2 className="w-4 h-4" />
                {row.match_status === 'ambiguous' ? 'Link to selected candidate' : 'Update existing record'}
              </Button>
            )}
            {row.match_status !== 'matched' && (
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2"
                disabled={resolve.isPending}
                onClick={() => handleAction('create')}
              >
                <CheckCircle2 className="w-4 h-4 text-success" />
                Create new product
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 text-muted-foreground"
              disabled={resolve.isPending}
              onClick={() => handleAction('skip')}
            >
              <SkipForward className="w-4 h-4" />
              Skip this row
            </Button>
          </div>
          {row.resolved_at && (
            <p className="text-xs text-muted-foreground mt-3">
              Resolved {new Date(row.resolved_at).toLocaleString()}
              {row.resolution_action && ` — ${row.resolution_action.replace('_', ' ')}`}
            </p>
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}
