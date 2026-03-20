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

export interface PipelineStats {
  // Core pipeline counts
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
      // Fetch all needed columns — no limit, paginated in batches of 1000
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
      };
    },
  });
}
