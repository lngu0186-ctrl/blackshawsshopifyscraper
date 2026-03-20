import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ScraperSettings {
  id?: string;
  user_id?: string;
  max_pages_per_source: number;
  max_products_per_run: number;
  max_concurrent_enrichments: number;
  max_export_rows: number;
  enrichment_batch_size: number;
  inter_request_delay_ms: number;
}

export const DEFAULT_SCRAPER_SETTINGS: ScraperSettings = {
  max_pages_per_source: 999,
  max_products_per_run: 999999,
  max_concurrent_enrichments: 5,
  max_export_rows: 999999,
  enrichment_batch_size: 50,
  inter_request_delay_ms: 800,
};

export function useScraperSettings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['scraper_settings', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ScraperSettings> => {
      const { data, error } = await supabase
        .from('scraper_settings')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as ScraperSettings) ?? { ...DEFAULT_SCRAPER_SETTINGS, user_id: user!.id };
    },
  });
}

export function useSaveScraperSettings() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (settings: ScraperSettings) => {
      const { error } = await supabase
        .from('scraper_settings')
        .upsert({ ...settings, user_id: user!.id }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scraper_settings'] });
      toast.success('Limits saved');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save limits'),
  });
}

export function useProductEditHistory(productId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['product_edit_history', productId],
    enabled: !!user && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_edit_history')
        .select('*')
        .eq('product_id', productId!)
        .eq('user_id', user!.id)
        .order('edited_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveProductField() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      productId,
      fieldName,
      newValue,
      oldValue,
      editSource = 'user',
    }: {
      productId: string;
      fieldName: string;
      newValue: string | null;
      oldValue: string | null;
      editSource?: string;
    }) => {
      // Read current override_fields and edited_fields
      const { data: current } = await supabase
        .from('scraped_products')
        .select('override_fields, edited_fields')
        .eq('id', productId)
        .single();

      const overrides = (current?.override_fields as Record<string, unknown>) ?? {};
      const editedFields = (current?.edited_fields as Record<string, unknown>) ?? {};

      // Save original value if not already saved
      if (!(fieldName in editedFields)) {
        editedFields[fieldName] = oldValue;
      }
      overrides[fieldName] = newValue;

      await supabase
        .from('scraped_products')
        .update({
          override_fields: overrides as any,
          edited_fields: editedFields as any,
          is_manually_edited: true,
        })
        .eq('id', productId);

      await supabase.from('product_edit_history').insert({
        user_id: user!.id,
        product_id: productId,
        field_name: fieldName,
        old_value: oldValue != null ? String(oldValue) : null,
        new_value: newValue != null ? String(newValue) : null,
        edit_source: editSource,
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['scraped_products'] });
      queryClient.invalidateQueries({ queryKey: ['product_edit_history', vars.productId] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save field'),
  });
}

export function useRevertProductField() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ productId, fieldName }: { productId: string; fieldName: string }) => {
      const { data: current } = await supabase
        .from('scraped_products')
        .select('override_fields, edited_fields')
        .eq('id', productId)
        .single();

      const overrides = { ...(current?.override_fields as Record<string, unknown> ?? {}) };
      const editedFields = (current?.edited_fields as Record<string, unknown>) ?? {};
      const originalValue = editedFields[fieldName];

      delete overrides[fieldName];

      const hasOverrides = Object.keys(overrides).length > 0;

      await supabase
        .from('scraped_products')
        .update({
          override_fields: overrides,
          is_manually_edited: hasOverrides,
        })
        .eq('id', productId);

      await supabase.from('product_edit_history').insert({
        user_id: user!.id,
        product_id: productId,
        field_name: fieldName,
        old_value: String(overrides[fieldName] ?? ''),
        new_value: originalValue != null ? String(originalValue) : null,
        edit_source: 'revert',
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['scraped_products'] });
      queryClient.invalidateQueries({ queryKey: ['product_edit_history', vars.productId] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to revert field'),
  });
}

export function useUpdateReviewStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, status }: { productId: string; status: string }) => {
      const { error } = await supabase
        .from('scraped_products')
        .update({ review_status: status, is_approved: status === 'approved' })
        .eq('id', productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scraped_products'] });
      toast.success('Review status updated');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to update status'),
  });
}
