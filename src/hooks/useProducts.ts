import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import type { ProductFilter } from '@/types/schemas';

export function useProducts(filter: ProductFilter) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['products', user?.id, filter],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*, product_variants(id, sku, price, compare_at_price, variant_title, option1, option2, option3, featured_image_url)', { count: 'exact' })
        .eq('user_id', user!.id);

      if (filter.search) {
        query = query.or(`title.ilike.%${filter.search}%,vendor.ilike.%${filter.search}%,tags.ilike.%${filter.search}%`);
      }
      if (filter.storeId) query = query.eq('store_id', filter.storeId);
      if (filter.productType) query = query.eq('product_type', filter.productType);
      if (filter.vendor) query = query.eq('vendor', filter.vendor);
      if (filter.priceMin != null) query = query.gte('price_min', filter.priceMin);
      if (filter.priceMax != null) query = query.lte('price_max', filter.priceMax);
      if (filter.changedSinceExport) {
        query = query.or('last_exported_at.is.null,last_changed_at.gt.last_exported_at');
      }

      const sortCol = filter.sortBy || 'scraped_at';
      const ascending = filter.sortDir === 'asc';
      query = query.order(sortCol, { ascending, nullsFirst: false });

      const from = ((filter.page || 1) - 1) * (filter.pageSize || 50);
      const to = from + (filter.pageSize || 50) - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      return { products: data ?? [], total: count ?? 0 };
    },
  });
}

export function useProductVariants(productId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['product_variants', productId],
    enabled: !!user && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .eq('product_id', productId!)
        .order('variant_position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProductFilters() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['product_filters', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: types } = await supabase
        .from('products')
        .select('product_type')
        .eq('user_id', user!.id)
        .not('product_type', 'is', null)
        .order('product_type');

      const { data: vendors } = await supabase
        .from('products')
        .select('vendor')
        .eq('user_id', user!.id)
        .not('vendor', 'is', null)
        .order('vendor');

      const uniqueTypes = [...new Set((types ?? []).map((r: any) => r.product_type).filter(Boolean))];
      const uniqueVendors = [...new Set((vendors ?? []).map((r: any) => r.vendor).filter(Boolean))];

      return { types: uniqueTypes as string[], vendors: uniqueVendors as string[] };
    },
  });
}
