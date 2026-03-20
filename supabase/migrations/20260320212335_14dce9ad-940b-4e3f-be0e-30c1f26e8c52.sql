
-- ============================================================
-- FIX 1: Backfill NULL store_id on scraper_events via run_id
-- ============================================================
UPDATE public.scraper_events e
SET store_id = srs.store_id
FROM public.scrape_run_stores srs
WHERE e.run_id = srs.scrape_run_id
  AND e.store_id IS NULL
  AND srs.store_id IS NOT NULL;

-- Second pass: for events where run maps to exactly one store
UPDATE public.scraper_events e
SET store_id = (
  SELECT srs2.store_id
  FROM public.scrape_run_stores srs2
  WHERE srs2.scrape_run_id = e.run_id
  LIMIT 1
)
WHERE e.store_id IS NULL
  AND e.run_id IS NOT NULL;

-- ============================================================
-- FIX 2: Clean up ghost runs stuck in 'running' > 3 hours
-- ============================================================
UPDATE public.scrape_runs
SET 
  status = 'failed',
  run_status = 'failed',
  finished_at = now()
WHERE status = 'running'
  AND finished_at IS NULL
  AND started_at < now() - interval '3 hours';

UPDATE public.scrape_run_stores srs
SET 
  status = 'error',
  terminal_status = 'failed',
  finished_at = now(),
  message = 'Auto-closed: parent run exceeded 3 hour timeout'
WHERE srs.status IN ('fetching', 'running', 'queued')
  AND srs.finished_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.scrape_runs r
    WHERE r.id = srs.scrape_run_id
      AND r.status = 'failed'
      AND r.finished_at IS NOT NULL
  );

-- ============================================================
-- FIX 3: Full confidence backfill for ALL products
-- ============================================================
UPDATE public.products p
SET
  confidence_score = (
    CASE WHEN p.title IS NOT NULL AND trim(p.title) != '' THEN 20 ELSE 0 END +
    CASE WHEN p.price_min IS NOT NULL AND p.price_min > 0 THEN 20 ELSE 0 END +
    CASE WHEN p.vendor IS NOT NULL AND trim(p.vendor) != '' THEN 10 ELSE 0 END +
    CASE WHEN p.images IS NOT NULL AND p.images::text NOT IN ('[]', 'null') THEN 15 ELSE 0 END +
    CASE WHEN p.body_html IS NOT NULL AND trim(p.body_html) != '' THEN 15 ELSE 0 END +
    CASE WHEN EXISTS (
      SELECT 1 FROM public.product_variants pv
      WHERE pv.product_id = p.id
        AND (pv.sku IS NOT NULL OR pv.barcode IS NOT NULL)
    ) THEN 10 ELSE 0 END +
    CASE WHEN p.scraped_at IS NOT NULL THEN 10 ELSE 0 END
  ),
  issue_flags = ARRAY_REMOVE(ARRAY[
    CASE WHEN p.price_min IS NULL OR p.price_min = 0 THEN 'missing_price' ELSE NULL END,
    CASE WHEN p.images IS NULL OR p.images::text IN ('[]', 'null') THEN 'missing_image' ELSE NULL END,
    CASE WHEN p.body_html IS NULL OR trim(p.body_html) = '' THEN 'missing_description' ELSE NULL END
  ], NULL);

-- Derive product_scrape_status from freshly computed confidence_score
UPDATE public.products p
SET product_scrape_status = CASE
  WHEN p.confidence_score >= 80 
    AND NOT (p.price_min IS NULL OR p.price_min = 0)
    AND NOT (p.images IS NULL OR p.images::text IN ('[]', 'null'))
    THEN 'ready'
  WHEN p.confidence_score >= 80 THEN 'review_required'
  WHEN p.confidence_score >= 50 THEN 'validated'
  WHEN p.confidence_score >= 20 THEN 'normalized'
  ELSE 'discovered'
END;

-- ============================================================
-- FIX 4: Performance indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scraper_events_store_id ON public.scraper_events(store_id);
CREATE INDEX IF NOT EXISTS idx_scraper_events_run_id ON public.scraper_events(run_id);
CREATE INDEX IF NOT EXISTS idx_scraper_events_severity ON public.scraper_events(severity);
CREATE INDEX IF NOT EXISTS idx_products_scrape_status ON public.products(product_scrape_status);
CREATE INDEX IF NOT EXISTS idx_products_store_confidence ON public.products(store_id, confidence_score);
CREATE INDEX IF NOT EXISTS idx_scrape_run_stores_run_id ON public.scrape_run_stores(scrape_run_id);
