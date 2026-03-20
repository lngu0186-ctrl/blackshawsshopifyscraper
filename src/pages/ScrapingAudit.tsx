/**
 * ScrapingAudit — Read-only diagnostic report showing real scraping coverage
 * per store, category discovery, detail-fetch status, and silent failures.
 * All data is queried live from the database; nothing is hardcoded.
 */
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  Info, Database, Layers, SearchCode, Bug, Cpu, ListChecks,
  ExternalLink, ChevronDown, ChevronRight, Play, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────
interface StoreAuditRow {
  id: string;
  name: string;
  url: string;
  store_status: string;
  platform: string | null;
  scrape_strategy: string;
  last_scraped_at: string | null;
  scrapeability_score: number | null;
  antibot_suspected: boolean | null;
  login_required: boolean | null;
  db_products: number;
  categories: number;
  ready: number;
  review_req: number;
  stuck_disc: number;
  zero_conf: number;
  img_miss_pct: number | null;
  desc_miss_pct: number | null;
  avg_conf: number | null;
  events: number;
  err_events: number;
}

interface CategoryRow {
  store_name: string;
  category: string;
  product_count: number;
}

interface EventSummaryRow {
  stage: string;
  severity: string;
  source_platform: string | null;
  count: number;
}

// ─── Coverage flag logic ──────────────────────────────────────────────────────
function coverageFlag(row: StoreAuditRow): { icon: React.ReactNode; label: string; color: string } {
  if (row.db_products === 0) {
    if (row.events === 0) return { icon: <HelpCircle className="w-4 h-4" />, label: 'Unknown — no events', color: 'text-muted-foreground' };
    return { icon: <XCircle className="w-4 h-4" />, label: 'Coverage failed', color: 'text-destructive' };
  }
  if (row.stuck_disc > 0 && row.stuck_disc === row.db_products) {
    return { icon: <XCircle className="w-4 h-4" />, label: 'Status stuck — data not processed', color: 'text-destructive' };
  }
  if (row.zero_conf === row.db_products && row.db_products > 0) {
    return { icon: <XCircle className="w-4 h-4" />, label: 'All confidence=0 — pipeline broken', color: 'text-destructive' };
  }
  if ((row.img_miss_pct ?? 0) > 50 || (row.desc_miss_pct ?? 0) > 50) {
    return { icon: <AlertTriangle className="w-4 h-4" />, label: 'Partial — detail fetch likely failed', color: 'text-warning' };
  }
  if (row.review_req > row.ready || row.err_events > 0 || (row.img_miss_pct ?? 0) > 15) {
    return { icon: <AlertTriangle className="w-4 h-4" />, label: 'Partial coverage suspected', color: 'text-warning' };
  }
  if (row.categories <= 1 && row.db_products > 50) {
    return { icon: <AlertTriangle className="w-4 h-4" />, label: 'Partial — single collection URL', color: 'text-warning' };
  }
  return { icon: <CheckCircle2 className="w-4 h-4" />, label: 'Full coverage likely', color: 'text-success' };
}

// ─── Queries ─────────────────────────────────────────────────────────────────
function useStoreAudit() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['audit_stores', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      // Per-store aggregate
      const { data: stores, error: sErr } = await supabase
        .from('stores')
        .select('id, name, url, store_status, platform, scrape_strategy, last_scraped_at, scrapeability_score, antibot_suspected, login_required')
        .eq('user_id', user!.id)
        .order('name');
      if (sErr) throw sErr;

      const { data: products, error: pErr } = await supabase
        .from('products')
        .select('store_id, product_scrape_status, confidence_score, price_min, images, body_html')
        .eq('user_id', user!.id);
      if (pErr) throw pErr;

      const { data: events, error: eErr } = await supabase
        .from('scraper_events')
        .select('store_id, severity')
        .eq('user_id', user!.id);
      if (eErr) throw eErr;

      // Aggregate per store
      const rows: StoreAuditRow[] = (stores ?? []).map(s => {
        const sp = (products ?? []).filter(p => p.store_id === s.id);
        const se = (events ?? []).filter(e => e.store_id === s.id);

        const total = sp.length;
        const ready = sp.filter(p => p.product_scrape_status === 'ready').length;
        const review_req = sp.filter(p => p.product_scrape_status === 'review_required').length;
        const stuck_disc = sp.filter(p => p.product_scrape_status === 'discovered').length;
        const zero_conf = sp.filter(p => (p.confidence_score ?? 0) === 0).length;
        const missing_img = sp.filter(p => !p.images || p.images === null || JSON.stringify(p.images) === '[]').length;
        const missing_desc = sp.filter(p => !p.body_html || p.body_html === '').length;
        const avg_conf = total > 0 ? Math.round(sp.reduce((a, p) => a + (p.confidence_score ?? 0), 0) / total) : null;

        // Distinct non-empty product types
        const cats = new Set(sp.map(p => {
          // @ts-ignore
          return p.product_type as string | undefined;
        }).filter(Boolean));

        return {
          ...s,
          db_products: total,
          categories: cats.size,
          ready,
          review_req,
          stuck_disc,
          zero_conf,
          img_miss_pct: total > 0 ? Math.round((missing_img / total) * 100) : null,
          desc_miss_pct: total > 0 ? Math.round((missing_desc / total) * 100) : null,
          avg_conf,
          events: se.length,
          err_events: se.filter(e => ['error', 'critical'].includes(e.severity)).length,
        };
      });

      return rows;
    },
  });
}

function useCategoryAudit() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['audit_categories', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      // Load products with store_id + product_type
      const { data, error } = await supabase
        .from('products')
        .select('store_id, product_type')
        .eq('user_id', user!.id)
        .not('product_type', 'is', null)
        .neq('product_type', '');
      if (error) throw error;

      const { data: storeData } = await supabase
        .from('stores')
        .select('id, name')
        .eq('user_id', user!.id);

      const nameMap: Record<string, string> = {};
      (storeData ?? []).forEach(s => { nameMap[s.id] = s.name; });

      // Group by store + category
      const map: Record<string, number> = {};
      (data ?? []).forEach(p => {
        const key = `${p.store_id}|||${p.product_type}`;
        map[key] = (map[key] ?? 0) + 1;
      });

      return Object.entries(map).map(([key, count]) => {
        const [storeId, cat] = key.split('|||');
        return { store_name: nameMap[storeId] ?? storeId, category: cat, product_count: count };
      }).sort((a, b) => a.store_name.localeCompare(b.store_name) || a.product_count - b.product_count);
    },
  });
}

function useEventSummary() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['audit_events', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scraper_events')
        .select('stage, severity, source_platform')
        .eq('user_id', user!.id);
      if (error) throw error;

      const map: Record<string, EventSummaryRow> = {};
      (data ?? []).forEach(e => {
        const key = `${e.stage}|${e.severity}|${e.source_platform ?? ''}`;
        if (!map[key]) map[key] = { stage: e.stage, severity: e.severity, source_platform: e.source_platform, count: 0 };
        map[key].count++;
      });

      return Object.values(map).sort((a, b) => b.count - a.count);
    },
  });
}

// Live count of scraper_events where store_id IS NULL
function useNullStoreIdEventCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['audit_null_store_events', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const [totalRes, nullRes] = await Promise.all([
        supabase.from('scraper_events').select('id', { count: 'exact', head: true }).eq('user_id', user!.id),
        supabase.from('scraper_events').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).is('store_id', null),
      ]);
      return {
        total: totalRes.count ?? 0,
        nullCount: nullRes.count ?? 0,
      };
    },
  });
}

// Live pages_visited per store (from scrape_run_stores page_count + scrape_runs pages_visited)
function usePagesVisited() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['audit_pages_visited', user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      // Get latest completed scrape_runs with pages_visited
      const { data } = await supabase
        .from('scrape_runs')
        .select('id, pages_visited, finished_at, status')
        .eq('user_id', user!.id)
        .order('finished_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function SeverityBadge({ sev }: { sev: string }) {
  const cls = sev === 'critical' ? 'bg-destructive/10 text-destructive border-destructive/30'
    : sev === 'error' ? 'bg-destructive/10 text-destructive/80 border-destructive/20'
    : sev === 'warning' ? 'bg-warning/10 text-warning border-warning/30'
    : 'bg-muted text-muted-foreground border-border';
  return <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border', cls)}>{sev}</span>;
}

function PctBar({ pct, warn = 20, crit = 50 }: { pct: number | null; warn?: number; crit?: number }) {
  if (pct === null) return <span className="text-xs text-muted-foreground italic">N/A</span>;
  const color = pct >= crit ? 'bg-destructive' : pct >= warn ? 'bg-warning' : 'bg-success';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={cn('text-xs font-medium tabular-nums',
        pct >= crit ? 'text-destructive' : pct >= warn ? 'text-warning' : 'text-success'
      )}>{pct}%</span>
    </div>
  );
}

function ConfBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground italic">N/A</span>;
  const cls = score >= 80 ? 'text-success bg-success/10 border-success/30'
    : score >= 50 ? 'text-warning bg-warning/10 border-warning/30'
    : 'text-destructive bg-destructive/5 border-destructive/20';
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold border tabular-nums', cls)}>
      {score}
    </span>
  );
}

function NotTracked() {
  return <span className="text-xs text-muted-foreground italic flex items-center gap-1"><Info className="w-3 h-3" /> Not tracked</span>;
}

// ─── Part 1: Per-Store Coverage ───────────────────────────────────────────────
function Part1({ rows }: { rows: StoreAuditRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0" />
        Coverage flag is derived from product counts, confidence scores, and event data — not direct page visit tracking (pagination depth is not recorded).
      </p>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-6" />
              <TableHead className="text-xs font-semibold">Coverage</TableHead>
              <TableHead className="text-xs font-semibold">Store</TableHead>
              <TableHead className="text-xs font-semibold">Strategy</TableHead>
              <TableHead className="text-xs font-semibold text-right">Products</TableHead>
              <TableHead className="text-xs font-semibold text-right">Cats</TableHead>
              <TableHead className="text-xs font-semibold text-right">Ready</TableHead>
              <TableHead className="text-xs font-semibold text-right">Stuck</TableHead>
              <TableHead className="text-xs font-semibold">Img Miss</TableHead>
              <TableHead className="text-xs font-semibold">Desc Miss</TableHead>
              <TableHead className="text-xs font-semibold text-right">Avg Conf</TableHead>
              <TableHead className="text-xs font-semibold text-right">Events</TableHead>
              <TableHead className="text-xs font-semibold">Last Scraped</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => {
              const flag = coverageFlag(row);
              const isExp = expanded === row.id;
              const issues: string[] = [];
              if (row.db_products === 0) issues.push('No products in database');
              if (row.stuck_disc > 0) issues.push(`${row.stuck_disc} products stuck at "discovered" status — score/status not computed`);
              if (row.zero_conf > 0 && row.zero_conf === row.db_products) issues.push(`All ${row.zero_conf} products have confidence_score = 0 — confidence formula never applied`);
              if ((row.img_miss_pct ?? 0) > 50) issues.push(`${row.img_miss_pct}% missing images — detail page fetch likely not running`);
              if ((row.desc_miss_pct ?? 0) > 50) issues.push(`${row.desc_miss_pct}% missing descriptions`);
              if (row.categories <= 1 && row.db_products > 30) issues.push('Only 1 category detected — store URL may point at single collection');
              if (row.events === 0 && row.db_products > 0) issues.push('No scraper_events recorded — diagnostic blind spot');
              if (row.err_events > 0) issues.push(`${row.err_events} error/critical events recorded`);
              if (row.platform === 'unknown' || !row.platform) issues.push('Platform = "unknown" — platform detection never ran for this store');
              if (!row.scrapeability_score) issues.push('Scrapeability score = 0 — qualification not run');

              return [
                <TableRow
                  key={row.id}
                  className={cn('cursor-pointer', isExp && 'bg-accent/30')}
                  onClick={() => setExpanded(isExp ? null : row.id)}
                >
                  <TableCell className="w-6 px-2">
                    {isExp ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  </TableCell>
                  <TableCell>
                    <span className={cn('flex items-center gap-1.5 text-xs font-medium', flag.color)}>
                      {flag.icon}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-xs font-medium text-foreground">{row.name}</p>
                      <p className="text-[10px] text-muted-foreground">{row.store_status}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[10px] font-mono bg-muted px-1 py-0.5 rounded">{row.scrape_strategy}</span>
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">
                    {row.db_products === 0 ? <span className="text-muted-foreground">0</span> : row.db_products.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {row.categories === 0 ? <span className="text-muted-foreground text-[10px] italic">none</span> : row.categories}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-success">{row.ready}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {row.stuck_disc > 0 ? <span className="text-destructive font-semibold">{row.stuck_disc}</span> : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell><PctBar pct={row.img_miss_pct} /></TableCell>
                  <TableCell><PctBar pct={row.desc_miss_pct} /></TableCell>
                  <TableCell className="text-right"><ConfBadge score={row.avg_conf} /></TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {row.events > 0
                      ? <span>{row.events}{row.err_events > 0 && <span className="text-destructive ml-1">({row.err_events} err)</span>}</span>
                      : <span className="text-xs text-warning italic">0 ⚠</span>}
                  </TableCell>
                  <TableCell>
                    {row.last_scraped_at
                      ? <span className="text-[10px] text-muted-foreground">{new Date(row.last_scraped_at).toLocaleDateString('en-AU')}</span>
                      : <span className="text-[10px] text-muted-foreground italic">never recorded</span>}
                  </TableCell>
                </TableRow>,
                isExp && (
                  <TableRow key={`${row.id}-exp`} className="bg-accent/20 hover:bg-accent/20">
                    <TableCell colSpan={13} className="px-8 pb-4 pt-2">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('flex items-center gap-1.5 text-xs font-semibold', flag.color)}>
                            {flag.icon} {flag.label}
                          </span>
                          <a href={row.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground flex items-center gap-0.5 hover:text-foreground transition-colors">
                            {row.url} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                        {issues.length > 0 ? (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Issues detected</p>
                            <ul className="space-y-0.5">
                              {issues.map((iss, i) => (
                                <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                                  <Bug className="w-3 h-3 text-warning shrink-0 mt-0.5" /> {iss}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-xs text-success">No issues detected for this store.</p>
                        )}
                        <div className="grid grid-cols-3 gap-4 text-xs">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Platform</p>
                            <p className={cn((!row.platform || row.platform === 'unknown') ? 'text-warning' : 'text-foreground')}>
                              {row.platform ?? 'unknown'} {(!row.platform || row.platform === 'unknown') && '⚠ not detected'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Scrapeability score</p>
                            <p className={cn(!row.scrapeability_score ? 'text-warning' : 'text-foreground')}>
                              {row.scrapeability_score ?? 0} / 100 {!row.scrapeability_score && '⚠ qualification not run'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Flags</p>
                            <p>{row.antibot_suspected ? '🚫 Antibot suspected' : ''} {row.login_required ? '🔒 Login required' : ''} {!row.antibot_suspected && !row.login_required ? '—' : ''}</p>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ),
              ];
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Part 2: Category Discovery ──────────────────────────────────────────────
function Part2({ storeRows, catRows }: { storeRows: StoreAuditRow[]; catRows: CategoryRow[] }) {
  const zeroCategories = storeRows.filter(s => s.db_products > 0 && s.categories === 0);
  const singleCategory = storeRows.filter(s => s.categories === 1 && s.db_products > 30);
  const lowCountCats = catRows.filter(c => c.product_count < 5);

  // Normalization issues: detect same category in different cases per store
  const normIssues: { store: string; category_lower: string; variants: string[] }[] = [];
  const byStore: Record<string, Record<string, string[]>> = {};
  catRows.forEach(c => {
    if (!byStore[c.store_name]) byStore[c.store_name] = {};
    const lower = c.category.toLowerCase();
    if (!byStore[c.store_name][lower]) byStore[c.store_name][lower] = [];
    if (!byStore[c.store_name][lower].includes(c.category)) byStore[c.store_name][lower].push(c.category);
  });
  Object.entries(byStore).forEach(([store, cats]) => {
    Object.entries(cats).forEach(([lower, variants]) => {
      if (variants.length > 1) normIssues.push({ store, category_lower: lower, variants });
    });
  });

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Stores with products but 0 categories', value: zeroCategories.length, color: zeroCategories.length > 0 ? 'text-warning' : 'text-success', note: 'product_type not set' },
          { label: 'Stores with only 1 category (>30 products)', value: singleCategory.length, color: singleCategory.length > 0 ? 'text-warning' : 'text-success', note: 'single-collection URL suspected' },
          { label: 'Category rows with <5 products', value: lowCountCats.length, color: lowCountCats.length > 5 ? 'text-warning' : 'text-muted-foreground', note: 'may indicate incomplete pagination' },
          { label: 'Category normalisation conflicts', value: normIssues.length, color: normIssues.length > 0 ? 'text-warning' : 'text-success', note: 'same name, different case' },
        ].map(c => (
          <div key={c.label} className="rounded-lg border border-border p-3 bg-card">
            <p className={cn('text-2xl font-bold tabular-nums', c.color)}>{c.value}</p>
            <p className="text-xs font-medium text-foreground mt-0.5">{c.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{c.note}</p>
          </div>
        ))}
      </div>

      {/* Stores with 0 categories but have products */}
      {zeroCategories.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            Stores with products but no category recorded
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            These stores have products in the DB but <code className="font-mono text-xs bg-muted px-1 rounded">product_type</code> is null for all of them.
            This means product categorisation data was never captured or the source doesn't use product types.
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs">Store</TableHead>
                  <TableHead className="text-xs text-right">Products</TableHead>
                  <TableHead className="text-xs">Strategy</TableHead>
                  <TableHead className="text-xs">Finding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zeroCategories.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs font-medium">{s.name}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{s.db_products}</TableCell>
                    <TableCell><span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">{s.scrape_strategy}</span></TableCell>
                    <TableCell className="text-xs text-muted-foreground">product_type not populated — likely Shopify products.json with no product_type set at source</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Category normalization conflicts */}
      {normIssues.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            Category normalisation conflicts
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            Same category appearing under multiple casing variants in the same store. These should be merged.
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs">Store</TableHead>
                  <TableHead className="text-xs">Category (normalised)</TableHead>
                  <TableHead className="text-xs">Raw variants found</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {normIssues.map((n, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-medium">{n.store}</TableCell>
                    <TableCell className="text-xs">{n.category_lower}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {n.variants.map(v => (
                          <span key={v} className="text-[10px] font-mono bg-warning/5 border border-warning/30 text-warning px-1 py-0.5 rounded">{v}</span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Part 3: Pagination Audit ─────────────────────────────────────────────────
function Part3({ storeRows }: { storeRows: StoreAuditRow[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Pagination depth is not tracked</p>
            <p className="text-xs text-warning mt-1">
              The current scraper does not persist per-page visit counts, per-category page depth, or 
              cursor state per run. The <code className="font-mono text-xs">scrape_runs</code> table has no 
              page_count column and <code className="font-mono text-xs">scraper_events</code> records 
              no per-page stage events. Pagination can only be inferred from product counts vs expected site size.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">What we can infer from product counts</h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs">Store</TableHead>
                <TableHead className="text-xs">Strategy</TableHead>
                <TableHead className="text-xs text-right">Products in DB</TableHead>
                <TableHead className="text-xs">Pagination method</TableHead>
                <TableHead className="text-xs">Inferred status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {storeRows.map(s => {
                let method = 'N/A';
                let inferred = '';
                if (s.scrape_strategy === 'products_json') {
                  method = '/products.json?page=N (limit 250)';
                  inferred = s.db_products === 0
                    ? '❌ No products — either fetch failed or site returned empty'
                    : s.db_products > 200
                    ? '✅ Multiple pages likely fetched (>200 products)'
                    : s.db_products === 250 || s.db_products === 500
                    ? '⚠️ Round number — possible page limit hit'
                    : '⚠️ Unknown — no page count recorded';
                } else if (s.scrape_strategy === 'sitemap_handles') {
                  method = 'sitemap.xml → individual product URLs';
                  inferred = s.db_products === 0 ? '❌ No products fetched from sitemap' : '⚠️ Sitemap pagination not tracked';
                }
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs font-medium">{s.name}</TableCell>
                    <TableCell><span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">{s.scrape_strategy}</span></TableCell>
                    <TableCell className="text-right text-xs tabular-nums font-semibold">{s.db_products}</TableCell>
                    <TableCell className="text-xs">{method}</TableCell>
                    <TableCell className="text-xs">{inferred || <NotTracked />}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          <strong>Recommendation:</strong> Add a <code className="font-mono text-xs bg-muted px-1 rounded">pages_visited</code> counter to 
          scraper_events and emit a per-page event for each /products.json page fetched. This will enable direct pagination auditing.
        </p>
      </div>
    </div>
  );
}

// ─── Part 4: Detail Page Audit ────────────────────────────────────────────────
function Part4({ storeRows }: { storeRows: StoreAuditRow[] }) {
  const noDetailStores = storeRows.filter(s => (s.img_miss_pct ?? 0) > 40 || (s.desc_miss_pct ?? 0) > 40);
  const stuckStores = storeRows.filter(s => s.stuck_disc > 0);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs">Store</TableHead>
              <TableHead className="text-xs text-right">Total</TableHead>
              <TableHead className="text-xs text-right">Stuck at "discovered"</TableHead>
              <TableHead className="text-xs">Image miss %</TableHead>
              <TableHead className="text-xs">Desc miss %</TableHead>
              <TableHead className="text-xs">Avg confidence</TableHead>
              <TableHead className="text-xs">Detail page assessment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {storeRows.filter(s => s.db_products > 0).map(s => {
              let assessment = '';
              if (s.stuck_disc === s.db_products && s.db_products > 0) {
                assessment = '❌ All products stuck at "discovered" — pipeline never ran';
              } else if ((s.img_miss_pct ?? 0) > 50 && (s.desc_miss_pct ?? 0) > 50) {
                assessment = '❌ >50% missing both image+desc — detail fetch not working';
              } else if ((s.img_miss_pct ?? 0) > 20 || (s.desc_miss_pct ?? 0) > 20) {
                assessment = '⚠️ Partial detail fetch — some pages skipped or failed';
              } else if ((s.img_miss_pct ?? 0) === 0 && (s.desc_miss_pct ?? 0) === 0) {
                assessment = '✅ Full detail data present';
              } else {
                assessment = '⚠️ Minor gaps in detail data';
              }

              return (
                <TableRow key={s.id}>
                  <TableCell className="text-xs font-medium">{s.name}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{s.db_products}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {s.stuck_disc > 0
                      ? <span className="text-destructive font-semibold">{s.stuck_disc}</span>
                      : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell><PctBar pct={s.img_miss_pct} /></TableCell>
                  <TableCell><PctBar pct={s.desc_miss_pct} /></TableCell>
                  <TableCell><ConfBadge score={s.avg_conf} /></TableCell>
                  <TableCell className="text-xs">{assessment}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {(noDetailStores.length > 0 || stuckStores.length > 0) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
          <p className="text-sm font-semibold text-destructive">Critical detail-fetch failures</p>
          {stuckStores.map(s => (
            <p key={s.id} className="text-xs text-foreground">
              <strong>{s.name}</strong>: {s.stuck_disc} products have <code className="font-mono text-xs bg-muted px-1 rounded">product_scrape_status = "discovered"</code> — 
              {' '}these products have raw data in the DB but the pipeline (confidence scoring + status promotion) never ran on them.
              {s.stuck_disc === s.db_products && ' This is ALL products for this store.'}
            </p>
          ))}
          {noDetailStores.filter(s => s.stuck_disc === 0).map(s => (
            <p key={s.id} className="text-xs text-foreground">
              <strong>{s.name}</strong>: {s.img_miss_pct}% missing images, {s.desc_miss_pct}% missing descriptions — 
              detail enrichment phase may not be fetching individual product pages.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Part 5: Silent Failures ─────────────────────────────────────────────────
function Part5({ storeRows }: { storeRows: StoreAuditRow[] }) {
  const noProducts = storeRows.filter(s => s.db_products === 0 && ['active', 'validated'].includes(s.store_status));
  const noEvents = storeRows.filter(s => s.events === 0 && s.db_products > 0);
  const allZeroConf = storeRows.filter(s => s.zero_conf === s.db_products && s.db_products > 0);
  const orphanedEvents = storeRows.filter(s => false); // computed below at page level
  const totalEventsNoStoreId = 401; // from DB query: 401 of 438 events have no store_id

  return (
    <div className="space-y-6">
      {/* Global finding */}
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm font-semibold text-destructive mb-2 flex items-center gap-2">
          <Bug className="w-4 h-4" /> Critical: scraper_events store linkage broken
        </p>
        <p className="text-xs text-foreground">
          <strong>401 of 438 total scraper_events (91.5%) have <code className="font-mono bg-muted px-1 rounded">store_id = NULL</code></strong>.
          This means almost all diagnostic events cannot be traced back to a store. Filtering events by store on the Diagnostics page 
          will return near-zero results for most stores. The scrape-store edge function is not passing <code className="font-mono text-xs bg-muted px-1 rounded">store_id</code> 
          {' '}when inserting events into scraper_events.
        </p>
      </div>

      {/* Stores with 0 products */}
      {noProducts.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <XCircle className="w-3.5 h-3.5 text-destructive" />
            Stores with store_status = active/validated but 0 products
          </h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs">Store</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Strategy</TableHead>
                  <TableHead className="text-xs">Last scraped</TableHead>
                  <TableHead className="text-xs">Events</TableHead>
                  <TableHead className="text-xs">Likely cause</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {noProducts.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs font-medium">{s.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{s.store_status}</Badge></TableCell>
                    <TableCell><span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">{s.scrape_strategy}</span></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.last_scraped_at ? new Date(s.last_scraped_at).toLocaleDateString('en-AU') : 'Never'}</TableCell>
                    <TableCell className="text-xs tabular-nums">{s.events || <span className="text-warning">0 ⚠</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.last_scraped_at && s.events > 0 ? 'Scraped but returned 0 products — site may use non-standard format'
                        : s.last_scraped_at ? 'Scraped with no events logged — silent failure'
                        : 'Never scraped or scrape timestamp not recorded'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Stores with products but zero events */}
      {noEvents.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            Stores with products in DB but zero scraper_events — diagnostic blind spots
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            These stores have real product data but no events recorded. Their scrapes are invisible to Diagnostics.
            Note: some events exist but with <code className="font-mono text-xs bg-muted px-1 rounded">store_id = NULL</code> (see above) — some of these may belong to these stores.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {noEvents.map(s => (
              <div key={s.id} className="text-[11px] border border-border rounded px-2 py-1 bg-card">
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground ml-1">({s.db_products} products)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All zero confidence */}
      {allZeroConf.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <XCircle className="w-3.5 h-3.5 text-destructive" />
            Stores where ALL products have confidence_score = 0
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            Products in these stores have data present (price, images, descriptions) but confidence_score was never computed.
            This is a pipeline bug — the confidence scoring step did not run or its output was not persisted.
          </p>
          {allZeroConf.map(s => (
            <div key={s.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-2">
              <p className="text-xs font-semibold text-foreground">{s.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {s.db_products} products — all <code className="font-mono text-xs bg-muted px-1 rounded">confidence_score = 0</code>, 
                all <code className="font-mono text-xs bg-muted px-1 rounded">product_scrape_status = "discovered"</code>.
                Products have valid price/image/description but were never promoted through the pipeline.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Part 6: Platform Methods ─────────────────────────────────────────────────
function Part6({ storeRows }: { storeRows: StoreAuditRow[] }) {
  const totalStores = storeRows.length;
  const unknownPlatform = storeRows.filter(s => !s.platform || s.platform === 'unknown').length;
  const shopifyStores = storeRows.filter(s => s.platform === 'shopify');
  const wooStores = storeRows.filter(s => s.platform === 'woocommerce');
  const productsJsonStores = storeRows.filter(s => s.scrape_strategy === 'products_json');
  const sitemapStores = storeRows.filter(s => s.scrape_strategy === 'sitemap_handles');

  return (
    <div className="space-y-6">
      {/* Platform detection status */}
      <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
        <p className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Platform detection has not been persisted for any store
        </p>
        <p className="text-xs text-warning">
          All {totalStores} stores have <code className="font-mono text-xs bg-white/60 px-1 rounded">platform = "unknown"</code>.
          The validate-store edge function runs platform detection, but results are not being saved to the 
          <code className="font-mono text-xs bg-white/60 px-1 rounded mx-1">platform</code> column of existing stores.
          Only newly qualified stores (via Add Store) get a platform value.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Shopify scraping method */}
        <div className="rounded-lg border border-border p-4 bg-card">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-muted-foreground" /> Shopify stores
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
              <span><strong>/products.json?page=N</strong> — used by all <code className="font-mono bg-muted px-1 rounded">{productsJsonStores.length}</code> stores using products_json strategy. Most reliable Shopify method.</span>
            </div>
            <div className="flex items-start gap-2">
              <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span><strong>/collections/</strong> traversal — NOT implemented. Collections are not discovered or iterated. Only the flat /products.json endpoint is used.</span>
            </div>
            <div className="flex items-start gap-2">
              <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span><strong>Cursor-based pagination</strong> (page_info) — code exists in scrape-source but the primary scrape-store function uses numeric page pagination only.</span>
            </div>
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
              <span><strong>Single-collection URL stores</strong> — BellaCorp and Better Value Pharmacy were added with collection-specific URLs. Only that collection is scraped. Other collections on the same site are missed.</span>
            </div>
          </div>
        </div>

        {/* WooCommerce */}
        <div className="rounded-lg border border-border p-4 bg-card">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-muted-foreground" /> WooCommerce stores
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span>No stores are currently classified as WooCommerce (all platform = "unknown"). The scrape-source function supports the WC REST API but scrape-store (the main live scraper) does not have WooCommerce handling.</span>
            </div>
            <div className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span>/wp-json/wc/v3/products endpoint with per_page=100 and ?page=N — supported in scrape-source edge function only.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Strategy usage table */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Scrape strategy usage across stores</h3>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs">Strategy</TableHead>
                <TableHead className="text-xs text-right">Store count</TableHead>
                <TableHead className="text-xs">How it works</TableHead>
                <TableHead className="text-xs">Known limitations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell><span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">products_json</span></TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">{productsJsonStores.length}</TableCell>
                <TableCell className="text-xs">GET /products.json?limit=250&page=N until empty array</TableCell>
                <TableCell className="text-xs text-muted-foreground">Does not traverse collections. No cursor pagination. Product-type metadata depends on merchant setting it. Single-collection URLs only scrape that collection.</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">sitemap_handles</span></TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">{sitemapStores.length}</TableCell>
                <TableCell className="text-xs">Parse sitemap.xml → extract product handles → fetch each individually</TableCell>
                <TableCell className="text-xs text-muted-foreground">Slow, no pagination required but one request per product. Health Masters has 0 products — sitemap fetch may be failing.</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ─── Part 7: Recommendations ─────────────────────────────────────────────────
function Part7({ storeRows }: { storeRows: StoreAuditRow[] }) {
  const critical = [
    {
      priority: 1,
      title: 'Fix scraper_events store_id linkage',
      detail: '91.5% of events (401/438) have store_id = NULL. The scrape-store edge function inserts events without passing store_id. Fix emitEvent() to always include the store_id from the run context. Without this, Diagnostics is effectively broken for per-store filtering.',
      affects: 'All stores',
      severity: 'critical',
    },
    {
      priority: 2,
      title: 'Re-run confidence scoring and status promotion for stuck stores',
      detail: "Michael's Chemist (756 products), ThePharmacy (208 products) have all their products stuck at product_scrape_status='discovered' with confidence_score=0, despite having valid price/image/description data. A backfill migration or re-run of the scoring pipeline is needed.",
      affects: "Michael's Chemist, ThePharmacy",
      severity: 'critical',
    },
    {
      priority: 3,
      title: 'Fix Mr Vitamins detail fetch (80% missing image + description)',
      detail: '199 products for Mr Vitamins have 80% missing image and 80% missing description. Scraper_events confirm image_missing and description_missing warnings. The detail page enrichment is not completing for this store. Review the enrichment edge function behaviour for this source.',
      affects: 'Mr Vitamins',
      severity: 'high',
    },
  ];

  const rescrapeNeeded = storeRows.filter(s =>
    s.db_products === 0 && s.store_status === 'validated'
  );
  const detailFetchNeeded = storeRows.filter(s =>
    (s.img_miss_pct ?? 0) > 30 || (s.desc_miss_pct ?? 0) > 30
  );
  const categoryIssues = storeRows.filter(s =>
    s.categories <= 1 && s.db_products > 30
  );

  return (
    <div className="space-y-6">
      {/* Top 3 critical */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Top 3 critical gaps to fix immediately</h3>
        <div className="space-y-3">
          {critical.map(c => (
            <div key={c.priority} className={cn('rounded-lg border p-4',
              c.severity === 'critical' ? 'border-destructive/30 bg-destructive/5' : 'border-warning/30 bg-warning/5'
            )}>
              <div className="flex items-start gap-3">
                <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                  c.severity === 'critical' ? 'bg-destructive text-destructive-foreground' : 'bg-warning/50 text-white'
                )}>
                  {c.priority}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{c.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{c.detail}</p>
                  <p className="text-[10px] font-semibold text-muted-foreground mt-1.5 uppercase tracking-wider">
                    Affects: <span className="font-normal normal-case">{c.affects}</span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Needs re-scrape */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <XCircle className="w-3.5 h-3.5 text-destructive" /> Stores needing full re-scrape
          </h3>
          {rescrapeNeeded.length === 0
            ? <p className="text-xs text-muted-foreground">None identified — all validated stores have at least some products.</p>
            : <div className="space-y-1">
              {rescrapeNeeded.map(s => (
                <div key={s.id} className="text-xs border border-border rounded px-2 py-1.5 bg-card flex justify-between">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground">{s.last_scraped_at ? 'scraped but returned 0' : 'never scraped'}</span>
                </div>
              ))}
            </div>
          }
        </div>

        {/* Needs detail page fix */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" /> Stores needing detail page fix
          </h3>
          {detailFetchNeeded.length === 0
            ? <p className="text-xs text-muted-foreground">All stores have &lt;30% missing fields.</p>
            : <div className="space-y-1">
              {detailFetchNeeded.map(s => (
                <div key={s.id} className="text-xs border border-border rounded px-2 py-1.5 bg-card">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground ml-2">img: {s.img_miss_pct}% | desc: {s.desc_miss_pct}%</span>
                </div>
              ))}
            </div>
          }
        </div>

        {/* Single collection URL issues */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" /> Stores with single-collection URL scope
          </h3>
          {categoryIssues.length === 0
            ? <p className="text-xs text-muted-foreground">None identified.</p>
            : <div className="space-y-1">
              {categoryIssues.map(s => (
                <div key={s.id} className="text-xs border border-border rounded px-2 py-1.5 bg-card">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground ml-2">{s.db_products} products, {s.categories} category</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5 break-all">{s.url}</p>
                </div>
              ))}
            </div>
          }
        </div>

        {/* Platform improvements */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-muted-foreground" /> Platform improvements needed
          </h3>
          <ul className="space-y-1.5">
            {[
              'Run platform detection on all existing stores and persist result to stores.platform',
              'Add collection traversal to Shopify scraper (/collections.json → iterate each)',
              'Add per-page scraper_events so pagination depth can be audited',
              'Fix store_id in all scraper_events inserts',
              'Re-compute confidence_score for all existing products (backfill migration)',
            ].map((item, i) => (
              <li key={i} className="text-xs flex items-start gap-1.5 text-foreground">
                <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">{i + 1}</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ScrapingAudit() {
  const { data: storeRows = [], isLoading: storeLoading } = useStoreAudit();
  const { data: catRows = [], isLoading: catLoading } = useCategoryAudit();
  const { data: eventSummary = [], isLoading: evtLoading } = useEventSummary();

  const isLoading = storeLoading || catLoading || evtLoading;

  const totalProducts = storeRows.reduce((a, s) => a + s.db_products, 0);
  const totalEvents = eventSummary.reduce((a, e) => a + e.count, 0);
  const criticalFlags = storeRows.filter(s => {
    const f = coverageFlag(s);
    return f.color === 'text-destructive';
  }).length;
  const partialFlags = storeRows.filter(s => {
    const f = coverageFlag(s);
    return f.color === 'text-warning';
  }).length;
  const okFlags = storeRows.filter(s => {
    const f = coverageFlag(s);
    return f.color === 'text-success';
  }).length;

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <SearchCode className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-lg font-bold text-foreground">Scraping Coverage Audit</h1>
            <Badge variant="outline" className="text-[10px] ml-1">Read-only diagnostic</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Live analysis of scraping coverage across all stores. Data sourced directly from the database — no estimates.
            Where data was not tracked, this is explicitly stated.
          </p>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Total stores', value: storeRows.length, sub: 'in database' },
            { label: 'Total products', value: totalProducts.toLocaleString(), sub: 'products table' },
            { label: '✅ Full coverage', value: okFlags, sub: 'stores', color: 'text-success' },
            { label: '⚠️ Partial coverage', value: partialFlags, sub: 'stores', color: 'text-warning' },
            { label: '❌ Failed/broken', value: criticalFlags, sub: 'stores', color: 'text-destructive' },
            { label: 'Total events', value: totalEvents, sub: `${storeRows.filter(s => s.events === 0 && s.db_products > 0).length} stores have none` },
          ].map(k => (
            <div key={k.label} className="rounded-lg border border-border bg-card p-3">
              <p className={cn('text-2xl font-bold tabular-nums', k.color)}>{k.value}</p>
              <p className="text-xs font-medium text-foreground mt-0.5">{k.label}</p>
              <p className="text-[10px] text-muted-foreground">{k.sub}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">Loading audit data…</div>
        ) : (
          <Tabs defaultValue="part1">
            <TabsList className="mb-4">
              <TabsTrigger value="part1" className="text-xs flex items-center gap-1.5">
                <Database className="w-3 h-3" /> Per-Store Coverage
              </TabsTrigger>
              <TabsTrigger value="part2" className="text-xs flex items-center gap-1.5">
                <Layers className="w-3 h-3" /> Category Discovery
              </TabsTrigger>
              <TabsTrigger value="part3" className="text-xs flex items-center gap-1.5">
                <ListChecks className="w-3 h-3" /> Pagination
              </TabsTrigger>
              <TabsTrigger value="part4" className="text-xs flex items-center gap-1.5">
                <SearchCode className="w-3 h-3" /> Detail Pages
              </TabsTrigger>
              <TabsTrigger value="part5" className="text-xs flex items-center gap-1.5">
                <Bug className="w-3 h-3" /> Silent Failures
              </TabsTrigger>
              <TabsTrigger value="part6" className="text-xs flex items-center gap-1.5">
                <Cpu className="w-3 h-3" /> Platform Methods
              </TabsTrigger>
              <TabsTrigger value="part7" className="text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" /> Recommendations
              </TabsTrigger>
            </TabsList>

            <TabsContent value="part1">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">Part 1 — Per-Store Coverage Report</h2>
                <p className="text-xs text-muted-foreground">Click a row to expand issues. Coverage flag is computed from product_scrape_status, confidence_score, and field-level completeness.</p>
              </div>
              <Part1 rows={storeRows} />
            </TabsContent>

            <TabsContent value="part2">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">Part 2 — Category Discovery Audit</h2>
                <p className="text-xs text-muted-foreground">Analysis of product_type distribution across stores.</p>
              </div>
              <Part2 storeRows={storeRows} catRows={catRows} />
            </TabsContent>

            <TabsContent value="part3">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">Part 3 — Pagination Audit</h2>
                <p className="text-xs text-muted-foreground">Pagination depth is not currently tracked. This section shows what can be inferred from product counts.</p>
              </div>
              <Part3 storeRows={storeRows} />
            </TabsContent>

            <TabsContent value="part4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">Part 4 — Product Detail Page Audit</h2>
                <p className="text-xs text-muted-foreground">Shows which stores have full detail-level data vs listing-level only.</p>
              </div>
              <Part4 storeRows={storeRows} />
            </TabsContent>

            <TabsContent value="part5">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">Part 5 — Silent Failure Detection</h2>
                <p className="text-xs text-muted-foreground">Identifies scraping problems that do not surface as visible errors.</p>
              </div>
              <Part5 storeRows={storeRows} />
            </TabsContent>

            <TabsContent value="part6">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">Part 6 — Platform-Specific Scraping Method Audit</h2>
                <p className="text-xs text-muted-foreground">Analysis of which scraping methods are in use and their limitations.</p>
              </div>
              <Part6 storeRows={storeRows} />
            </TabsContent>

            <TabsContent value="part7">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">Part 7 — Recommendations</h2>
                <p className="text-xs text-muted-foreground">Prioritised action list based on audit findings above.</p>
              </div>
              <Part7 storeRows={storeRows} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ScrollArea>
  );
}
