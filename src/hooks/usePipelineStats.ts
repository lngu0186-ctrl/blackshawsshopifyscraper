/**
 * usePipelineStats — Single canonical source of truth for product pipeline counts.
 *
 * ALL pages must derive their counts from this hook so numbers reconcile everywhere.
 * The hook queries scraped_products (the enrichment pipeline) and provides:
 *   - discovered, queued, enriched, failed, authBlocked, exportReady
 *   - readyCount, reviewRequired, partialRaw
 *   - field coverage: missingPrice, missingImage, missingDescription, missingBarcode
 *   - per-source breakdown
 *   - productsTableStats: canonical counts from the products table (used by Dashboard pipeline stages)
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export interface ProductsTableStats {
  sourcesDetected: number;        // stores where store_status != 'unreachable'
  categoriesDiscovered: number;   // COUNT DISTINCT product_type in products
  productsDiscovered: number;     // products with valid product_scrape_status
  detailEnriched: number;         // product_scrape_status IN (detail_fetched, normalized, validated, ready)
  pricesExtracted: number;        // price_min IS NOT NULL AND > 0
  imagesExtracted: number;        // images IS NOT NULL (jsonb not null/empty)
  descriptionsExtracted: number;  // body_html IS NOT NULL AND != ''
  validationComplete: number;     // product_scrape_status IN (validated, ready)
  exportReady: number;            // product_scrape_status = 'ready'
}

export interface PipelineStats {
  // Core pipeline counts (from scraped_products — powers KPI row)
  discovered: number;
  queued: number;       // detail_scraped=false AND auth_blocked=false AND scrape_status!='failed'
  enriched: number;     // detail_scraped=true AND scrape_status='enriched'
  failed: number;       // scrape_status='failed' AND auth_blocked=false
  authBlocked: number;  // auth_blocked=true
  exportReady: number;  // confidence_score>=90 AND price IS NOT NULL

  // Quality tiers (these must match export page numbers)
  readyCount: number;       // confidence_score >= 90
  reviewRequired: number;   // confidence_score 60–89
  partialRaw: number;       // confidence_score < 60

  // Missing field counts
  missingPrice: number;
  missingImage: number;
  missingDescription: number;
  missingBarcode: number;

  // Detail scrape health
  detailFailed: number;

  // Per-source stats
  bySource: Record<string, SourceStats>;

  // Canonical counts from the products table — used by the Dashboard pipeline stages panel
  productsTableStats: ProductsTableStats;
}

export interface SourceStats {
  sourceKey: string;
  sourceName: string;
  discovered: number;
  enriched: number;
  exportReady: number;
  reviewRequired: number;
  partialRaw: number;
  missingPrice: number;
  missingImage: number;
  missingDescription: number;
  authBlocked: number;
  lastScrapedAt: string | null;
}

export function usePipelineStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pipeline_stats', user?.id],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async (): Promise<PipelineStats> => {
      // ── 1. scraped_products batched fetch (powers KPI row) ─────────────────
      let allRows: any[] = [];
      let from = 0;
      const batchSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('scraped_products')
          .select(
            'id, source_key, source_name, price, image_url, description_html, barcode, ' +
            'confidence_score, scrape_status, detail_scraped, auth_blocked, ' +
            'detail_fetch_error, scraped_at'
          )
          .eq('user_id', user!.id)
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows = [...allRows, ...data];
        if (data.length < batchSize) break;
        from += batchSize;
      }

      const rows = allRows;
      const total = rows.length;

      const discovered = total;
      const queued = rows.filter(
        r => !r.detail_scraped && !r.auth_blocked && r.scrape_status !== 'failed'
      ).length;
      const enriched = rows.filter(
        r => r.detail_scraped && r.scrape_status === 'enriched'
      ).length;
      const failed = rows.filter(
        r => r.scrape_status === 'failed' && !r.auth_blocked
      ).length;
      const authBlocked = rows.filter(r => r.auth_blocked).length;
      const exportReady = rows.filter(
        r => r.confidence_score >= 90 && r.price != null
      ).length;

      const readyCount = rows.filter(r => r.confidence_score >= 90).length;
      const reviewRequired = rows.filter(
        r => r.confidence_score >= 60 && r.confidence_score < 90
      ).length;
      const partialRaw = rows.filter(r => r.confidence_score < 60).length;

      const missingPrice = rows.filter(r => r.price == null).length;
      const missingImage = rows.filter(r => !r.image_url).length;
      const missingDescription = rows.filter(r => !r.description_html).length;
      const missingBarcode = rows.filter(r => !r.barcode).length;
      const detailFailed = rows.filter(r => r.detail_fetch_error != null).length;

      // Per-source breakdown
      const sourceMap: Record<string, SourceStats> = {};
      for (const r of rows) {
        const key = r.source_key ?? 'unknown';
        if (!sourceMap[key]) {
          sourceMap[key] = {
            sourceKey: key,
            sourceName: r.source_name ?? key,
            discovered: 0,
            enriched: 0,
            exportReady: 0,
            reviewRequired: 0,
            partialRaw: 0,
            missingPrice: 0,
            missingImage: 0,
            missingDescription: 0,
            authBlocked: 0,
            lastScrapedAt: null,
          };
        }
        const s = sourceMap[key];
        s.discovered++;
        if (r.detail_scraped && r.scrape_status === 'enriched') s.enriched++;
        if (r.confidence_score >= 90 && r.price != null) s.exportReady++;
        if (r.confidence_score >= 60 && r.confidence_score < 90) s.reviewRequired++;
        if (r.confidence_score < 60) s.partialRaw++;
        if (r.price == null) s.missingPrice++;
        if (!r.image_url) s.missingImage++;
        if (!r.description_html) s.missingDescription++;
        if (r.auth_blocked) s.authBlocked++;
        if (r.scraped_at && (!s.lastScrapedAt || r.scraped_at > s.lastScrapedAt)) {
          s.lastScrapedAt = r.scraped_at;
        }
      }

      // ── 2. Canonical products table counts (parallel HEAD queries) ──────────
      const DISCOVERED_STATUSES = ['discovered', 'detail_fetched', 'normalized', 'validated', 'ready', 'review_required'];
      const ENRICHED_STATUSES   = ['detail_fetched', 'normalized', 'validated', 'ready'];
      const VALIDATED_STATUSES  = ['validated', 'ready'];

      const [
        sourcesRes,
        productsDiscoveredRes,
        detailEnrichedRes,
        pricesRes,
        imagesRes,
        descriptionsRes,
        validatedRes,
        exportReadyRes,
        categoriesRes,
      ] = await Promise.all([
        // Sources detected: stores where store_status != 'unreachable'
        supabase
          .from('stores')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .neq('store_status', 'unreachable'),

        // Products discovered
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .in('product_scrape_status', DISCOVERED_STATUSES),

        // Detail enriched
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .in('product_scrape_status', ENRICHED_STATUSES),

        // Prices extracted
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .not('price_min', 'is', null)
          .gt('price_min', 0),

        // Images extracted — images jsonb column is not null
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .not('images', 'is', null),

        // Descriptions extracted
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .not('body_html', 'is', null)
          .neq('body_html', ''),

        // Validation complete
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .in('product_scrape_status', VALIDATED_STATUSES),

        // Export ready
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('product_scrape_status', 'ready'),

        // Categories discovered: fetch distinct product_type values (not a COUNT DISTINCT query)
        supabase
          .from('products')
          .select('product_type')
          .eq('user_id', user!.id)
          .not('product_type', 'is', null),
      ]);

      // Count distinct categories client-side (Supabase doesn't support COUNT DISTINCT via REST)
      const distinctCategories = new Set(
        (categoriesRes.data ?? []).map((r: any) => r.product_type).filter(Boolean)
      ).size;

      const productsTableStats: ProductsTableStats = {
        sourcesDetected:       sourcesRes.count          ?? 0,
        categoriesDiscovered:  distinctCategories,
        productsDiscovered:    productsDiscoveredRes.count ?? 0,
        detailEnriched:        detailEnrichedRes.count    ?? 0,
        pricesExtracted:       pricesRes.count            ?? 0,
        imagesExtracted:       imagesRes.count            ?? 0,
        descriptionsExtracted: descriptionsRes.count      ?? 0,
        validationComplete:    validatedRes.count         ?? 0,
        exportReady:           exportReadyRes.count       ?? 0,
      };

      return {
        discovered,
        queued,
        enriched,
        failed,
        authBlocked,
        exportReady,
        readyCount,
        reviewRequired,
        partialRaw,
        missingPrice,
        missingImage,
        missingDescription,
        missingBarcode,
        detailFailed,
        bySource: sourceMap,
        productsTableStats,
      };
    },
  });
}
