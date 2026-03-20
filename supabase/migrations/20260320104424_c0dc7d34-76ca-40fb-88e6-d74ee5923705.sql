
-- ============================================================
-- 1. stores.store_status
-- ============================================================
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS store_status text NOT NULL DEFAULT 'active'
    CHECK (store_status IN (
      'active','validated','unreachable','blocked',
      'auth_required','scrapeable','partial','failing'
    ));

UPDATE public.stores SET store_status =
  CASE
    WHEN auth_status IN ('blocked','failed') OR auth_blocked_reason IS NOT NULL
      THEN 'blocked'
    WHEN requires_auth = true AND auth_status = 'none'
      THEN 'auth_required'
    WHEN validation_status = 'invalid' OR consecutive_failures >= 5
      THEN 'unreachable'
    WHEN consecutive_failures BETWEEN 1 AND 4 OR health_status = 'degraded'
      THEN 'failing'
    WHEN health_status = 'partial'
      THEN 'partial'
    WHEN validation_status = 'valid' AND consecutive_failures = 0
      THEN 'validated'
    ELSE 'active'
  END;

-- ============================================================
-- 2. scrape_runs.run_status
-- ============================================================
ALTER TABLE public.scrape_runs
  ADD COLUMN IF NOT EXISTS run_status text NOT NULL DEFAULT 'queued'
    CHECK (run_status IN (
      'queued','started','source_detected',
      'category_discovery_started','category_discovery_completed',
      'product_discovery_started','product_discovery_completed',
      'detail_enrichment_started','detail_enrichment_completed',
      'validation_completed','export_ready',
      'failed','cancelled'
    ));

UPDATE public.scrape_runs SET run_status =
  CASE
    WHEN status = 'cancelled' THEN 'cancelled'
    WHEN status = 'failed'    THEN 'failed'
    WHEN status = 'completed' THEN 'export_ready'
    WHEN status = 'running'   THEN 'started'
    ELSE 'queued'
  END;

-- ============================================================
-- 3. scraped_products.product_scrape_status
-- ============================================================
ALTER TABLE public.scraped_products
  ADD COLUMN IF NOT EXISTS product_scrape_status text NOT NULL DEFAULT 'discovered'
    CHECK (product_scrape_status IN (
      'discovered','detail_fetched','normalized','validated',
      'ready','review_required','excluded','failed'
    ));

UPDATE public.scraped_products SET product_scrape_status =
  CASE
    WHEN auth_blocked = true                              THEN 'excluded'
    WHEN scrape_status = 'failed'                        THEN 'failed'
    WHEN scrape_status = 'enriched' AND confidence_score >= 90 THEN 'ready'
    WHEN scrape_status = 'enriched' AND confidence_score >= 60 THEN 'review_required'
    WHEN scrape_status = 'enriched'                      THEN 'normalized'
    WHEN detail_scraped = true                           THEN 'detail_fetched'
    ELSE 'discovered'
  END;

-- ============================================================
-- 4. scraped_products.issue_flags
-- ============================================================
ALTER TABLE public.scraped_products
  ADD COLUMN IF NOT EXISTS issue_flags text[] NOT NULL DEFAULT '{}';

UPDATE public.scraped_products SET issue_flags = (
  SELECT COALESCE(array_agg(flag), '{}') FROM (
    SELECT 'missing_price'       AS flag WHERE price IS NULL
    UNION ALL
    SELECT 'missing_image'       WHERE image_url IS NULL
    UNION ALL
    SELECT 'missing_description' WHERE description_html IS NULL
    UNION ALL
    SELECT 'no_barcode'          WHERE barcode IS NULL AND ean IS NULL AND upc IS NULL AND gtin IS NULL
    UNION ALL
    SELECT 'detail_fetch_failed' WHERE detail_fetch_error IS NOT NULL
    UNION ALL
    SELECT 'low_confidence'      WHERE confidence_score < 60
    UNION ALL
    SELECT 'source_parse_weak'   WHERE scrape_method = 'unknown' OR scrape_method IS NULL
    UNION ALL
    SELECT 'raw_vendor_case'
      WHERE brand IS NOT NULL AND brand != ''
        AND (brand = upper(brand) OR brand = lower(brand))
        AND length(brand) > 2
    UNION ALL
    SELECT 'raw_category_case'
      WHERE category IS NOT NULL AND category != ''
        AND (category = upper(category) OR category = lower(category))
        AND length(category) > 2
  ) flags
);

-- ============================================================
-- 5. products table: confidence_score + product_scrape_status + issue_flags
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS confidence_score integer NOT NULL DEFAULT 0
    CHECK (confidence_score >= 0 AND confidence_score <= 100);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_scrape_status text NOT NULL DEFAULT 'discovered'
    CHECK (product_scrape_status IN (
      'discovered','detail_fetched','normalized','validated',
      'ready','review_required','excluded','failed'
    ));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS issue_flags text[] NOT NULL DEFAULT '{}';

UPDATE public.products SET confidence_score = (
  CASE WHEN title IS NOT NULL AND title != '' THEN 20 ELSE 0 END +
  CASE WHEN price_min IS NOT NULL THEN 20 ELSE 0 END +
  CASE WHEN vendor IS NOT NULL AND vendor != '' THEN 10 ELSE 0 END +
  CASE WHEN images IS NOT NULL AND images != 'null'::jsonb AND images != '[]'::jsonb THEN 15 ELSE 0 END +
  CASE WHEN body_html IS NOT NULL AND body_html != '' THEN 15 ELSE 0 END +
  CASE WHEN shopify_product_id IS NOT NULL THEN 10 ELSE 0 END +
  CASE WHEN body_html IS NOT NULL AND images IS NOT NULL AND images != '[]'::jsonb THEN 10 ELSE 0 END
);

UPDATE public.products SET product_scrape_status =
  CASE
    WHEN confidence_score >= 90 THEN 'ready'
    WHEN confidence_score >= 60 THEN 'review_required'
    WHEN confidence_score >= 30 THEN 'normalized'
    WHEN body_html IS NOT NULL  THEN 'detail_fetched'
    ELSE 'discovered'
  END;

UPDATE public.products SET issue_flags = (
  SELECT COALESCE(array_agg(flag), '{}') FROM (
    SELECT 'missing_price'       AS flag WHERE price_min IS NULL
    UNION ALL
    SELECT 'missing_image'
      WHERE images IS NULL OR images = 'null'::jsonb OR images = '[]'::jsonb
    UNION ALL
    SELECT 'missing_description' WHERE body_html IS NULL OR body_html = ''
    UNION ALL
    SELECT 'no_barcode'
      WHERE NOT EXISTS (
        SELECT 1 FROM product_variants pv
         WHERE pv.product_id = products.id
           AND pv.barcode IS NOT NULL AND pv.barcode != ''
      )
    UNION ALL
    SELECT 'low_confidence'      WHERE confidence_score < 60
    UNION ALL
    SELECT 'raw_vendor_case'
      WHERE vendor IS NOT NULL AND vendor != ''
        AND (vendor = upper(vendor) OR vendor = lower(vendor))
        AND length(vendor) > 2
    UNION ALL
    SELECT 'raw_category_case'
      WHERE product_type IS NOT NULL AND product_type != ''
        AND (product_type = upper(product_type) OR product_type = lower(product_type))
        AND length(product_type) > 2
  ) flags
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_stores_store_status
  ON public.stores (store_status);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_run_status
  ON public.scrape_runs (run_status);

CREATE INDEX IF NOT EXISTS idx_scraped_products_product_scrape_status
  ON public.scraped_products (product_scrape_status);

CREATE INDEX IF NOT EXISTS idx_scraped_products_issue_flags
  ON public.scraped_products USING GIN (issue_flags);

CREATE INDEX IF NOT EXISTS idx_products_product_scrape_status
  ON public.products (product_scrape_status);

CREATE INDEX IF NOT EXISTS idx_products_issue_flags
  ON public.products USING GIN (issue_flags);

CREATE INDEX IF NOT EXISTS idx_products_confidence_score
  ON public.products (confidence_score);
