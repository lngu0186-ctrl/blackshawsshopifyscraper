
-- Block 1: Backfill store_id on scraper_events where store_id IS NULL but run_id is set
-- Join through scrape_run_stores since scrape_runs doesn't have a single store_id
UPDATE public.scraper_events e
SET store_id = srs.store_id
FROM (
  SELECT DISTINCT ON (scrape_run_id) scrape_run_id, store_id
  FROM public.scrape_run_stores
  ORDER BY scrape_run_id, store_id
) srs
WHERE e.run_id = srs.scrape_run_id
  AND e.store_id IS NULL
  AND e.run_id IS NOT NULL;

-- Block 7: Add pages_visited column to scrape_runs
ALTER TABLE public.scrape_runs
  ADD COLUMN IF NOT EXISTS pages_visited integer NOT NULL DEFAULT 0;
