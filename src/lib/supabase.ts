// Re-export the auto-configured Supabase client from the integration layer.
// This avoids duplicating client creation and ensures the correct env vars are used.
export { supabase } from '@/integrations/supabase/client';
