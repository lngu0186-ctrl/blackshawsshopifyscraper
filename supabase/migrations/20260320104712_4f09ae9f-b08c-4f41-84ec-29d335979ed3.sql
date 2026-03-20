
-- ============================================================
-- scraper_events: canonical lifecycle event log for the pipeline
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scraper_events (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  user_id         uuid        NOT NULL,
  store_id        uuid        REFERENCES public.stores(id)       ON DELETE SET NULL,
  run_id          uuid        REFERENCES public.scrape_runs(id)  ON DELETE SET NULL,
  product_id      uuid        REFERENCES public.products(id)     ON DELETE SET NULL,
  stage           text        NOT NULL CHECK (stage IN (
    'run_started',
    'run_completed',
    'run_failed',
    'source_validation_failed',
    'platform_detection_failed',
    'category_discovery_failed',
    'product_extraction_failed',
    'detail_fetch_failed',
    'price_missing',
    'image_missing',
    'description_missing',
    'duplicate_candidate',
    'normalization_warning',
    'validation_warning',
    'auth_blocked',
    'rate_limited',
    'antibot_suspected',
    'export_excluded',
    'export_generated'
  )),
  severity        text        NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical')),
  url             text,
  reason_code     text,
  message         text        NOT NULL DEFAULT '',
  raw_error       text,
  source_platform text
);

-- Enable RLS
ALTER TABLE public.scraper_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "se_user"
  ON public.scraper_events
  FOR ALL
  TO public
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast operator queries
CREATE INDEX idx_scraper_events_user_stage
  ON public.scraper_events (user_id, stage);

CREATE INDEX idx_scraper_events_created_at
  ON public.scraper_events (created_at DESC);

CREATE INDEX idx_scraper_events_store_id
  ON public.scraper_events (store_id);

CREATE INDEX idx_scraper_events_run_id
  ON public.scraper_events (run_id);

CREATE INDEX idx_scraper_events_severity
  ON public.scraper_events (severity);
