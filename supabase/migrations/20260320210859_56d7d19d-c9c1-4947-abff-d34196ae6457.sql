-- Extend scraper_events with richer diagnostic fields for state machine tracking
ALTER TABLE public.scraper_events
  ADD COLUMN IF NOT EXISTS collection_handle text,
  ADD COLUMN IF NOT EXISTS strategy_name text,
  ADD COLUMN IF NOT EXISTS attempt_number integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS http_status integer,
  ADD COLUMN IF NOT EXISTS was_auto_recovered boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS was_operator_action boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz;

-- Extend scrape_run_stores with operator-control flags and progress tracking
ALTER TABLE public.scrape_run_stores
  ADD COLUMN IF NOT EXISTS skip_requested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_collection text,
  ADD COLUMN IF NOT EXISTS current_strategy text,
  ADD COLUMN IF NOT EXISTS collections_total integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collections_completed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collections_skipped integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collections_failed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminal_status text;