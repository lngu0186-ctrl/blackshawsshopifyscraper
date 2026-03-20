import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type { Store } from '@/types/schemas';

export function useStores() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['stores', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('user_id', user!.id)
        .order('name');
      if (error) throw error;
      return data as Store[];
    },
  });
}

export function useAddStore() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ name, normalizedUrl, validationStatus, myshopifyDomain, url }: {
      name: string; normalizedUrl: string; url: string;
      validationStatus: string; myshopifyDomain?: string;
    }) => {
      const { data, error } = await supabase.from('stores').insert({
        user_id: user!.id,
        name,
        url,
        normalized_url: normalizedUrl,
        myshopify_domain: myshopifyDomain || null,
        enabled: true,
        validation_status: validationStatus,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      toast.success('Store added successfully');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to add store'),
  });
}

export function useUpdateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Store> & { id: string }) => {
      const { error } = await supabase.from('stores').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stores'] }),
    onError: (e: any) => toast.error(e.message || 'Failed to update store'),
  });
}

export function useDeleteStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      toast.success('Store deleted');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to delete store'),
  });
}

export function useSeedStores() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/seed-stores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      toast.success(`Seeded ${data.inserted?.length ?? 0} stores`);
    },
    onError: (e: any) => toast.error(e.message || 'Failed to seed stores'),
  });
}

export function useValidateStore() {
  return useMutation({
    mutationFn: async (url: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/validate-store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{
        valid: boolean;
        normalized_url: string;
        myshopify_domain?: string;
        error?: string;
      }>;
    },
  });
}
