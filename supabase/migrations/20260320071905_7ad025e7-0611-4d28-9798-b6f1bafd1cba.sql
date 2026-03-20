
-- ── scrape_diagnostics: per-stage failure tracking ────────────────────────────
CREATE TABLE IF NOT EXISTS public.scrape_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scrape_job_id uuid REFERENCES public.scrape_jobs(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  source_key text,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'failed',
  severity text NOT NULL DEFAULT 'error',
  url text,
  http_status integer,
  parser_used text,
  selector_used text,
  retry_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  field_name text,
  extracted_value_preview text,
  missing_fields text[] DEFAULT '{}',
  failure_reason text,
  raw_error text,
  debug_payload jsonb,
  ai_analysis text,
  ai_recommendation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scrape_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sd_user" ON public.scrape_diagnostics
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_scrape_diagnostics_user_source ON public.scrape_diagnostics(user_id, source_key);
CREATE INDEX IF NOT EXISTS idx_scrape_diagnostics_user_stage ON public.scrape_diagnostics(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_scrape_diagnostics_user_status ON public.scrape_diagnostics(user_id, status);
CREATE INDEX IF NOT EXISTS idx_scrape_diagnostics_created ON public.scrape_diagnostics(created_at DESC);

-- ── Add health tracking columns to stores ─────────────────────────────────────
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_reason text,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;

-- ── Extend scrape_jobs ────────────────────────────────────────────────────────
ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS stores_skipped integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stores_included integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initiated_by text DEFAULT 'user';
