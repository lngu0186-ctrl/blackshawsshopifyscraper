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
    mutationFn: async ({
      name, normalizedUrl, validationStatus, myshopifyDomain, url, scrapeStrategy,
      requiresAuth, authType, platform, platformConfidence, scrapeabilityScore,
      reachabilityStatus, qualificationNotes, storeType, antibotSuspected,
      loginRequired, sitemapFound, sitemapUrl,
    }: {
      name: string; normalizedUrl: string; url: string;
      validationStatus: string; myshopifyDomain?: string;
      scrapeStrategy?: string; requiresAuth?: boolean; authType?: string;
      platform?: string; platformConfidence?: string; scrapeabilityScore?: number;
      reachabilityStatus?: string; qualificationNotes?: string; storeType?: string;
      antibotSuspected?: boolean; loginRequired?: boolean; sitemapFound?: boolean; sitemapUrl?: string | null;
    }) => {
      const { data, error } = await supabase.from('stores').insert({
        user_id: user!.id,
        name,
        url,
        normalized_url: normalizedUrl,
        myshopify_domain: myshopifyDomain || null,
        enabled: true,
        validation_status: validationStatus,
        scrape_strategy: scrapeStrategy || 'products_json',
        requires_auth: requiresAuth || false,
        auth_type: authType || 'none',
        auth_status: 'none',
        store_status: (scrapeabilityScore ?? 0) >= 60 ? 'validated' : 'active',
        platform: platform || 'unknown',
        platform_confidence: platformConfidence || null,
        scrapeability_score: scrapeabilityScore || 0,
        reachability_status: reachabilityStatus || 'unknown',
        qualification_notes: qualificationNotes || null,
        qualified_at: new Date().toISOString(),
        store_type: storeType || 'unknown',
        antibot_suspected: antibotSuspected || false,
        login_required: loginRequired || false,
        sitemap_found: sitemapFound || false,
        sitemap_url: sitemapUrl || null,
      } as any).select().single();
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
        scrape_strategy: string;
        validation_status: string;
        requires_auth: boolean;
        auth_type?: string;
        normalized_url: string;
        myshopify_domain?: string;
        message: string;
        error?: string;
      }>;
    },
  });
}

export function useAuthStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      store_id: string;
      url: string;
      auth_type: string;
      password?: string;
      email?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/auth-store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{
        success: boolean;
        auth_status: string;
        scrape_strategy?: string;
        message: string;
      }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
    },
    onError: (e: any) => toast.error(e.message || 'Authentication failed'),
  });
}
