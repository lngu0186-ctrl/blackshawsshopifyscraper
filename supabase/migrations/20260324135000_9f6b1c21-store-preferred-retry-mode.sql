ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS preferred_retry_mode text NOT NULL DEFAULT 'auto'
  CHECK (preferred_retry_mode IN ('auto', 'default', 'smaller_batch', 'slow_pacing'));
