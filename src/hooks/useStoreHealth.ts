/**
 * useStoreHealth — per-store operational health metrics.
 * Queries products table for counts and scraper_events for failure rates.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

export interface StoreHealthMetrics {
  storeId: string;
  discovered: number;
  enriched: number;
  ready: number;
  reviewRequired: number;
  totalProducts: number;
  missingImagePct: number;
  missingDescriptionPct: number;
  missingPricePct: number;
  failuresLast7Days: number;
  healthBadge: 'healthy' | 'degraded' | 'failing' | 'blocked' | 'auth_required' | 'unknown';
}

export function useStoreHealth(storeId: string | null | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['store_health', storeId, user?.id],
    enabled: !!user && !!storeId,
    staleTime: 30_000,
    queryFn: async (): Promise<StoreHealthMetrics> => {
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [
        discoveredRes,
        enrichedRes,
        readyRes,
        reviewRes,
        missingImageRes,
        missingDescRes,
        missingPriceRes,
        failuresRes,
      ] = await Promise.all([
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('store_id', storeId!),
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('store_id', storeId!)
          .in('product_scrape_status', ['detail_fetched', 'normalized', 'validated', 'ready']),
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('store_id', storeId!)
          .eq('product_scrape_status', 'ready'),
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('store_id', storeId!)
          .eq('product_scrape_status', 'review_required'),
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('store_id', storeId!)
          .is('images', null),
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('store_id', storeId!)
          .is('body_html', null),
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('store_id', storeId!)
          .is('price_min', null),
        supabase
          .from('scraper_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id)
          .eq('store_id', storeId!)
          .in('severity', ['error', 'critical'])
          .gte('created_at', since7d),
      ]);

      const total = discoveredRes.count ?? 0;
      const enriched = enrichedRes.count ?? 0;
      const ready = readyRes.count ?? 0;
      const reviewRequired = reviewRes.count ?? 0;
      const missingImage = missingImageRes.count ?? 0;
      const missingDesc = missingDescRes.count ?? 0;
      const missingPrice = missingPriceRes.count ?? 0;
      const failures7d = failuresRes.count ?? 0;

      const missingImagePct = total > 0 ? Math.round((missingImage / total) * 100) : 0;
      const missingDescPct = total > 0 ? Math.round((missingDesc / total) * 100) : 0;
      const missingPricePct = total > 0 ? Math.round((missingPrice / total) * 100) : 0;

      // Health badge logic
      let healthBadge: StoreHealthMetrics['healthBadge'] = 'unknown';
      if (total === 0) {
        healthBadge = 'unknown';
      } else if (failures7d >= 3) {
        healthBadge = 'failing';
      } else if (
        missingImagePct < 20 &&
        missingDescPct < 20 &&
        missingPricePct < 20 &&
        failures7d <= 1
      ) {
        healthBadge = 'healthy';
      } else {
        healthBadge = 'degraded';
      }

      return {
        storeId: storeId!,
        discovered: total,
        enriched,
        ready,
        reviewRequired,
        totalProducts: total,
        missingImagePct,
        missingDescriptionPct: missingDescPct,
        missingPricePct,
        failuresLast7Days: failures7d,
        healthBadge,
      };
    },
  });
}
