import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export function useCanonicalMatchQueue() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['canonical_match_queue', user?.id],
    enabled: !!user,
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('canonical_product_matches')
        .select(`
          id,
          decision,
          match_method,
          confidence_score,
          is_primary,
          decision_notes,
          created_at,
          canonical_products!inner(id,title,canonical_brand,canonical_barcode,match_status,product_type,primary_image_url),
          product_source_records!inner(id,title,vendor,barcode,sku,product_type,price_min,image_url,source_kind,source_name,store_id,product_id)
        `)
        .eq('user_id', user!.id)
        .in('decision', ['pending', 'rejected'])
        .order('confidence_score', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCanonicalReviewActions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, decision, notes }: { id: string; decision: 'accepted' | 'rejected'; notes?: string }) => {
      const { error } = await supabase
        .from('canonical_product_matches')
        .update({ decision, decision_notes: notes || null, decided_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['canonical_match_queue'] });
      toast.success(vars.decision === 'accepted' ? 'Match accepted' : 'Match rejected');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to update match review'),
  });
}
