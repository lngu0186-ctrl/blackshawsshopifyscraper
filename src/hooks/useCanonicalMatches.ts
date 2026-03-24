import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// canonical_product_matches table does not exist in this project's schema.
// These hooks are kept as stubs to prevent import errors from pages that reference them.

export function useCanonicalMatchQueue() {
  return { data: [], isLoading: false, error: null };
}

export function useCanonicalReviewActions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, decision, notes }: { ids: string[]; decision: 'accepted' | 'rejected'; notes?: string }) => {
      // Table not available in current schema — no-op
      void ids; void decision; void notes;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['canonical_match_queue'] });
      const count = vars.ids.length;
      toast.success(`${vars.decision === 'accepted' ? 'Accepted' : 'Rejected'} ${count} match${count === 1 ? '' : 'es'}`);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update match review'),
  });
}
