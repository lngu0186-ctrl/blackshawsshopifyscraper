import { useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ExternalLink, Pencil, RotateCcw, CheckCircle2, AlertTriangle,
  Copy, ChevronDown, ChevronUp, Lock, Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  useSaveProductField, useRevertProductField, useUpdateReviewStatus, useProductEditHistory,
} from '@/hooks/useScraperSettings';
import { toast } from 'sonner';

// ── Source badge ──────────────────────────────────────────────────────────────
const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  scraped:          { label: 'scraped',         cls: 'bg-muted text-muted-foreground' },
  inferred:         { label: 'inferred',        cls: 'bg-blue-500/10 text-blue-500' },
  'AI-suggested':   { label: 'AI-suggested',    cls: 'bg-purple-500/10 text-purple-500' },
  'manually edited':{ label: 'edited',          cls: 'bg-warning/10 text-warning' },
};

function SourceBadge({ source, tooltip }: { source: string; tooltip?: string }) {
  const { label, cls } = SOURCE_BADGE[source] ?? SOURCE_BADGE.scraped;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide cursor-default ${cls}`}>
          {label}
        </span>
      </TooltipTrigger>
      {tooltip && <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>}
    </Tooltip>
  );
}

// ── Barcode validator ─────────────────────────────────────────────────────────
function barcodeType(s: string | null): string | null {
  if (!s) return null;
  if (/^\d{13}$/.test(s)) return 'EAN-13';
  if (/^\d{8}$/.test(s))  return 'EAN-8';
  if (/^\d{12}$/.test(s)) return 'UPC-A';
  if (/^\d{14}$/.test(s)) return 'GTIN-14';
  if (/^\d{6,11}$/.test(s)) return 'partial';
  return 'invalid';
}

// ── Confidence badge ──────────────────────────────────────────────────────────
function ConfidenceBadge({ score }: { score: number }) {
  const cls = score >= 90 ? 'bg-success/15 text-success' : score >= 60 ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive';
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{score}/100</span>;
}

// ── Inline editable field row ─────────────────────────────────────────────────
function FieldRow({
  label, value, fieldKey, productId, overrides, isMultiline = false, tooltip,
}: {
  label: string;
  value: string | null | undefined;
  fieldKey: string;
  productId: string;
  overrides: Record<string, unknown>;
  isMultiline?: boolean;
  tooltip?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const save = useSaveProductField();
  const revert = useRevertProductField();

  const isOverridden = fieldKey in overrides;
  const displayValue = isOverridden ? String(overrides[fieldKey] ?? '') : (value ?? '—');
  const source = isOverridden ? 'manually edited' : 'scraped';

  const startEdit = () => { setDraft(displayValue === '—' ? '' : displayValue); setEditing(true); };
  const cancelEdit = () => setEditing(false);
  const commitEdit = () => {
    save.mutate({ productId, fieldName: fieldKey, newValue: draft || null, oldValue: value ?? null });
    setEditing(false);
  };
  const handleRevert = () => revert.mutate({ productId, fieldName: fieldKey });

  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/40 last:border-0 group">
      <span className="text-[11px] text-muted-foreground w-32 flex-shrink-0 pt-0.5">{label}</span>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="space-y-1.5">
            {isMultiline ? (
              <Textarea
                className="text-xs h-20 resize-none"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                autoFocus
              />
            ) : (
              <Input
                className="h-7 text-xs"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
              />
            )}
            <div className="flex gap-1">
              <Button size="sm" className="h-6 text-xs px-2" onClick={commitEdit} disabled={save.isPending}>Save</Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={cancelEdit}>Cancel</Button>
            </div>
          </div>
        ) : (
          <span className={`text-xs ${displayValue === '—' ? 'text-muted-foreground italic' : 'text-foreground'} break-all`}>
            {displayValue}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <SourceBadge source={source} tooltip={tooltip} />
        {!editing && (
          <>
            <button onClick={startEdit} className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded">
              <Pencil className="w-3 h-3" />
            </button>
            {isOverridden && (
              <button onClick={handleRevert} className="text-muted-foreground hover:text-warning transition-colors p-0.5 rounded" title="Revert to original">
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-4 pb-1 first:pt-0">
      {title}
    </p>
  );
}

// ── Diagnostics for a product ─────────────────────────────────────────────────
function ProductDiagnosticsTab({ sourceUrl }: { sourceUrl: string }) {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['product_diags', sourceUrl],
    enabled: !!user && !!sourceUrl,
    queryFn: async () => {
      const { data } = await supabase
        .from('scrape_diagnostics')
        .select('*')
        .eq('user_id', user!.id)
        .eq('url', sourceUrl)
        .order('created_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  if (isLoading) return <div className="p-4"><Skeleton className="h-20 w-full" /></div>;
  if (!data?.length) return <p className="text-xs text-muted-foreground p-4">No diagnostics found for this URL.</p>;

  return (
    <div className="space-y-1.5 p-1">
      {data.map((d: any) => (
        <div key={d.id} className="text-xs border border-border/50 rounded p-2.5 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={d.status === 'success' ? 'default' : 'destructive'} className="text-[9px]">{d.status}</Badge>
            <span className="text-muted-foreground">{d.stage}</span>
            {d.http_status && <span className="text-muted-foreground">HTTP {d.http_status}</span>}
            <span className="text-muted-foreground ml-auto">{new Date(d.created_at).toLocaleString()}</span>
          </div>
          {d.failure_reason && <p className="text-destructive">{d.failure_reason}</p>}
          {d.ai_analysis && <p className="text-purple-400 text-[11px] mt-1">AI: {d.ai_analysis}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────
interface ProductDetailDrawerProps {
  product: any | null;
  open: boolean;
  onClose: () => void;
}

export function ProductDetailDrawer({ product, open, onClose }: ProductDetailDrawerProps) {
  const { data: history, isLoading: historyLoading } = useProductEditHistory(product?.id ?? null);
  const updateStatus = useUpdateReviewStatus();
  const revertAll = useSaveProductField();
  const [expandDesc, setExpandDesc] = useState(false);

  const overrides = (product?.override_fields as Record<string, unknown>) ?? {};
  const getVal = useCallback((field: string) => {
    if (field in overrides) return String(overrides[field] ?? '');
    return product?.[field] ?? null;
  }, [product, overrides]);

  if (!product) return null;

  const variants: any[] = Array.isArray(product.product_variants) ? product.product_variants : [];
  const categoryPath = Array.isArray(product.category_path) ? product.category_path : [];
  const tags = Array.isArray(product.tags)
    ? product.tags
    : typeof product.tags === 'string'
      ? product.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];
  const missingFields = Array.isArray(product.missing_fields) ? product.missing_fields : [];
  const imageUrls = Array.isArray(product.image_urls) ? product.image_urls : [];
  const images: string[] = [
    ...(product.image_url ? [product.image_url] : []),
    ...imageUrls.filter((u: string) => u !== product.image_url),
  ];

  const copyJson = (obj: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    toast.success('Copied to clipboard');
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border space-y-2">
          <div className="flex items-start gap-3">
            {images[0] && (
              <img src={images[0]} alt="" className="w-12 h-12 rounded-lg object-cover border border-border flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-sm font-semibold leading-tight line-clamp-2">{product.title}</SheetTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-muted-foreground">{product.source_name}</span>
                {product.auth_blocked && (
                  <span className="flex items-center gap-1 text-[10px] text-warning font-medium">
                    <Lock className="w-3 h-3" /> Auth Blocked
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {product.confidence_score != null && <ConfidenceBadge score={product.confidence_score} />}
            <Badge variant="outline" className="text-[10px]">{product.review_status ?? 'pending'}</Badge>
            {product.price != null && (
              <span className="text-sm font-bold">${Number(product.price).toFixed(2)}</span>
            )}
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs defaultValue="fields" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full rounded-none border-b border-border justify-start h-9 px-2 gap-0 bg-transparent">
            {['overview','fields','images','variants','diagnostics','raw','history'].map(t => (
              <TabsTrigger key={t} value={t}
                className="text-[11px] h-8 px-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent capitalize">
                {t === 'raw' ? 'Raw' : t === 'history' ? 'History' : t}
              </TabsTrigger>
            ))}
          </TabsList>

          <ScrollArea className="flex-1">
            {/* Overview */}
            <TabsContent value="overview" className="p-4 mt-0 space-y-3">
              {images[0] && (
                <img src={images[0]} alt={product.title} className="w-full h-40 object-contain rounded-lg border border-border bg-muted/20" />
              )}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ['Source', product.source_name],
                  ['Scrape Method', product.scrape_method],
                  ['Confidence', product.confidence_score != null ? `${product.confidence_score}/100` : '—'],
                  ['Review Status', product.review_status ?? 'pending'],
                  ['Price', product.price != null ? `$${Number(product.price).toFixed(2)}` : '—'],
                  ['Last Scraped', product.scraped_at ? new Date(product.scraped_at).toLocaleString() : '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-muted-foreground text-[10px]">{k}</p>
                    <p className="font-medium mt-0.5">{v ?? '—'}</p>
                  </div>
                ))}
              </div>
              {missingFields.length > 0 && (
                <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
                  <p className="text-[10px] font-semibold text-warning mb-1">Missing fields</p>
                  <p className="text-xs text-warning">{missingFields.join(', ')}</p>
                </div>
              )}
            </TabsContent>

            {/* Fields */}
            <TabsContent value="fields" className="p-4 mt-0">
              <SectionHeader title="Identity" />
              <FieldRow label="Source store" value={product.source_name} fieldKey="source_name" productId={product.id} overrides={overrides} />
              <FieldRow label="Source URL" value={product.source_url} fieldKey="source_url" productId={product.id} overrides={overrides} />
              <FieldRow label="External ID" value={product.external_id} fieldKey="external_id" productId={product.id} overrides={overrides} />
              <FieldRow label="SKU" value={product.sku} fieldKey="sku" productId={product.id} overrides={overrides} />
              <div className="flex items-start gap-2 py-2 border-b border-border/40">
                <span className="text-[11px] text-muted-foreground w-32 flex-shrink-0 pt-0.5">Barcode</span>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs">{getVal('barcode') ?? '—'}</span>
                  {getVal('barcode') && (
                    <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">
                      {barcodeType(getVal('barcode'))}
                    </span>
                  )}
                </div>
                <SourceBadge source={overrides.barcode ? 'manually edited' : 'scraped'} />
              </div>
              <FieldRow label="GTIN" value={product.gtin} fieldKey="gtin" productId={product.id} overrides={overrides} />

              <SectionHeader title="Product Info" />
              <FieldRow label="Title" value={product.title} fieldKey="title" productId={product.id} overrides={overrides} />
              <FieldRow label="Brand / Vendor" value={product.brand} fieldKey="brand" productId={product.id} overrides={overrides} />
              <FieldRow label="Category" value={product.category} fieldKey="category" productId={product.id} overrides={overrides} />
              <FieldRow label="Category Path" value={categoryPath.join(' > ')} fieldKey="category_path" productId={product.id} overrides={overrides} />
              <FieldRow label="Tags" value={tags.join('; ')} fieldKey="tags" productId={product.id} overrides={overrides} />
              <FieldRow label="Size" value={product.size_text} fieldKey="size_text" productId={product.id} overrides={overrides} />

              <SectionHeader title="Pricing" />
              <FieldRow label="Price" value={product.price != null ? String(product.price) : null} fieldKey="price" productId={product.id} overrides={overrides} />
              <FieldRow label="Was Price" value={product.was_price != null ? String(product.was_price) : null} fieldKey="was_price" productId={product.id} overrides={overrides} />
              <FieldRow label="Currency" value={product.currency} fieldKey="currency" productId={product.id} overrides={overrides} />
              {product.auth_blocked && (
                <div className="flex items-center gap-2 py-2 text-xs text-warning">
                  <Lock className="w-3 h-3" />
                  Price blocked — store requires authentication
                </div>
              )}

              <SectionHeader title="Availability" />
              <FieldRow label="In Stock" value={product.in_stock != null ? String(product.in_stock) : null} fieldKey="in_stock" productId={product.id} overrides={overrides} />
              <FieldRow label="Availability" value={product.availability_text} fieldKey="availability_text" productId={product.id} overrides={overrides} />

              <SectionHeader title="Description" />
              <div className="py-2">
                <div className={`text-xs text-foreground overflow-hidden transition-all ${expandDesc ? '' : 'max-h-20'}`}
                  dangerouslySetInnerHTML={{ __html: getVal('description_html') ?? '<em class="text-muted-foreground">No description</em>' }} />
                <button onClick={() => setExpandDesc(v => !v)} className="text-[10px] text-primary mt-1 flex items-center gap-0.5">
                  {expandDesc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {expandDesc ? 'Collapse' : 'Expand'}
                </button>
              </div>

              <SectionHeader title="Notes" />
              <FieldRow label="Notes" value={product.notes} fieldKey="notes" productId={product.id} overrides={overrides} isMultiline />

              <SectionHeader title="Quality" />
              <div className="flex items-start gap-2 py-2 border-b border-border/40">
                <span className="text-[11px] text-muted-foreground w-32 flex-shrink-0">Confidence</span>
                <div className="flex-1">
                  {product.confidence_score != null ? <ConfidenceBadge score={product.confidence_score} /> : '—'}
                </div>
              </div>
              <div className="flex items-start gap-2 py-2 border-b border-border/40">
                <span className="text-[11px] text-muted-foreground w-32 flex-shrink-0">Missing fields</span>
                <span className="text-xs text-warning">{missingFields.join(', ') || 'none'}</span>
              </div>
              <div className="flex items-start gap-2 py-2 border-b border-border/40">
                <span className="text-[11px] text-muted-foreground w-32 flex-shrink-0">Review status</span>
                <FieldRow label="" value={product.review_status ?? 'pending'} fieldKey="review_status" productId={product.id} overrides={overrides} />
              </div>
            </TabsContent>

            {/* Images */}
            <TabsContent value="images" className="p-4 mt-0">
              {images.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <ImageIcon className="w-8 h-8 opacity-30" />
                  <p className="text-xs">No images found</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {images.map((url, i) => (
                  <div key={url} className={`relative rounded-lg overflow-hidden border-2 ${i === 0 ? 'border-primary' : 'border-border'}`}>
                    <img src={url} alt={`Image ${i + 1}`} className="w-full h-32 object-contain bg-muted/20" />
                    {i === 0 && (
                      <span className="absolute top-1 left-1 text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-semibold">Primary</span>
                    )}
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="absolute top-1 right-1 bg-background/80 rounded p-0.5 text-muted-foreground hover:text-foreground">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Variants */}
            <TabsContent value="variants" className="p-4 mt-0">
              {variants.length === 0 ? (
                <p className="text-xs text-muted-foreground">No variants</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1.5 pr-3 font-medium">Option</th>
                        <th className="text-left py-1.5 pr-3 font-medium">SKU</th>
                        <th className="text-right py-1.5 pr-3 font-medium">Price</th>
                        <th className="text-right py-1.5 pr-3 font-medium">Was</th>
                        <th className="text-left py-1.5 font-medium">Barcode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variants.map((v: any) => (
                        <tr key={v.id} className="border-b border-border/40">
                          <td className="py-1.5 pr-3">{[v.option1, v.option2, v.option3].filter(Boolean).join(' / ') || v.variant_title || 'Default'}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{v.sku || '—'}</td>
                          <td className="py-1.5 pr-3 text-right font-mono">{v.price != null ? `$${Number(v.price).toFixed(2)}` : '—'}</td>
                          <td className="py-1.5 pr-3 text-right font-mono text-muted-foreground">{v.compare_at_price != null ? `$${Number(v.compare_at_price).toFixed(2)}` : '—'}</td>
                          <td className="py-1.5">{v.barcode || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* Diagnostics */}
            <TabsContent value="diagnostics" className="mt-0">
              <ProductDiagnosticsTab sourceUrl={product.source_url} />
            </TabsContent>

            {/* Raw Source */}
            <TabsContent value="raw" className="p-4 mt-0 space-y-3">
              {['raw_listing', 'raw_detail'].map(key => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold capitalize">{key.replace('_', ' ')}</p>
                    <button onClick={() => copyJson(product[key])} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                  </div>
                  <pre className="text-[10px] bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-48 font-mono leading-relaxed">
                    {product[key] ? JSON.stringify(product[key], null, 2) : 'null'}
                  </pre>
                </div>
              ))}
            </TabsContent>

            {/* Edit History */}
            <TabsContent value="history" className="p-4 mt-0">
              {historyLoading && <Skeleton className="h-20 w-full" />}
              {!historyLoading && (!history || history.length === 0) && (
                <p className="text-xs text-muted-foreground">No edit history.</p>
              )}
              {!historyLoading && history && history.length > 0 && (
                <div className="space-y-1.5">
                  {(history as any[]).map((h: any) => (
                    <div key={h.id} className="text-xs border border-border/50 rounded p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{h.field_name}</span>
                        <span className="text-[10px] text-muted-foreground">{new Date(h.edited_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                        <span className="line-through truncate max-w-[120px]">{h.old_value || '—'}</span>
                        <span>→</span>
                        <span className="text-foreground truncate max-w-[120px]">{h.new_value || '—'}</span>
                        <Badge variant="outline" className="text-[9px] ml-auto">{h.edit_source}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {/* Footer actions */}
        <div className="border-t border-border px-4 py-3 flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            onClick={() => updateStatus.mutate({ productId: product.id, status: 'needs_review' })}
            disabled={updateStatus.isPending}
          >
            <AlertTriangle className="w-3 h-3 mr-1.5" />
            Needs Review
          </Button>
          <Button
            size="sm"
            className="text-xs h-8"
            onClick={() => updateStatus.mutate({ productId: product.id, status: 'approved' })}
            disabled={updateStatus.isPending}
          >
            <CheckCircle2 className="w-3 h-3 mr-1.5" />
            Approve
          </Button>
          {product.source_url && (
            <a
              href={product.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
