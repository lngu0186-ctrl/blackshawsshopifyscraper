-- Backfill canonical groundwork from current products table.
-- Non-destructive: preserves existing product rows while creating source-record and match scaffolding.

-- 1) Backfill source records from products
INSERT INTO public.product_source_records (
  user_id,
  store_id,
  product_id,
  source_kind,
  source_name,
  source_record_key,
  source_url,
  title,
  vendor,
  barcode,
  sku,
  product_type,
  price_min,
  image_url,
  description_text,
  raw_payload,
  first_seen_at,
  last_seen_at
)
SELECT
  p.user_id,
  p.store_id,
  p.id,
  'store_scrape',
  COALESCE(s.name, 'Store scrape'),
  COALESCE(p.handle, p.id::text),
  p.url,
  p.title,
  p.vendor,
  NULLIF(TRIM(p.barcode), ''),
  NULLIF(TRIM((
    SELECT pv.sku
    FROM public.product_variants pv
    WHERE pv.product_id = p.id
    ORDER BY pv.created_at ASC NULLS LAST
    LIMIT 1
  )), ''),
  p.product_type,
  p.price_min,
  p.image_url,
  CASE
    WHEN p.body_html IS NULL THEN NULL
    ELSE regexp_replace(p.body_html, '<[^>]+>', '', 'g')
  END,
  jsonb_build_object(
    'handle', p.handle,
    'confidence_score', p.confidence_score,
    'product_scrape_status', p.product_scrape_status,
    'missing_fields', p.missing_fields,
    'source_table', 'products'
  ),
  COALESCE(p.first_seen_at, p.created_at, now()),
  COALESCE(p.scraped_at, p.updated_at, now())
FROM public.products p
LEFT JOIN public.stores s ON s.id = p.store_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_source_records psr WHERE psr.product_id = p.id
);

-- 2) Create canonical products grouped primarily by barcode, otherwise by title+vendor heuristic.
WITH source_groups AS (
  SELECT
    psr.user_id,
    CASE
      WHEN NULLIF(TRIM(psr.barcode), '') IS NOT NULL THEN 'barcode:' || lower(trim(psr.barcode))
      ELSE 'title_vendor:' || md5(lower(coalesce(trim(psr.title), '')) || '|' || lower(coalesce(trim(psr.vendor), '')))
    END AS grouping_key,
    min(psr.id) AS seed_source_record_id,
    min(psr.created_at) AS first_created_at
  FROM public.product_source_records psr
  GROUP BY psr.user_id,
    CASE
      WHEN NULLIF(TRIM(psr.barcode), '') IS NOT NULL THEN 'barcode:' || lower(trim(psr.barcode))
      ELSE 'title_vendor:' || md5(lower(coalesce(trim(psr.title), '')) || '|' || lower(coalesce(trim(psr.vendor), '')))
    END
), seeds AS (
  SELECT
    sg.user_id,
    sg.grouping_key,
    psr.title,
    lower(trim(psr.title)) AS normalized_title,
    psr.vendor,
    psr.barcode,
    psr.product_type,
    psr.image_url,
    psr.description_text,
    sg.first_created_at
  FROM source_groups sg
  JOIN public.product_source_records psr ON psr.id = sg.seed_source_record_id
)
INSERT INTO public.canonical_products (
  user_id,
  title,
  normalized_title,
  canonical_brand,
  canonical_barcode,
  barcode_confidence,
  product_type,
  primary_image_url,
  canonical_description,
  match_status,
  created_at,
  updated_at
)
SELECT
  seeds.user_id,
  COALESCE(seeds.title, 'Untitled Product'),
  seeds.normalized_title,
  seeds.vendor,
  NULLIF(TRIM(seeds.barcode), ''),
  CASE WHEN NULLIF(TRIM(seeds.barcode), '') IS NOT NULL THEN 'heuristic' ELSE 'unknown' END,
  seeds.product_type,
  seeds.image_url,
  seeds.description_text,
  CASE WHEN NULLIF(TRIM(seeds.barcode), '') IS NOT NULL THEN 'auto_matched' ELSE 'review_required' END,
  seeds.first_created_at,
  now()
FROM seeds
WHERE NOT EXISTS (
  SELECT 1
  FROM public.canonical_products cp
  WHERE cp.user_id = seeds.user_id
    AND (
      (NULLIF(TRIM(cp.canonical_barcode), '') IS NOT NULL AND NULLIF(TRIM(cp.canonical_barcode), '') = NULLIF(TRIM(seeds.barcode), ''))
      OR (
        NULLIF(TRIM(cp.canonical_barcode), '') IS NULL
        AND cp.normalized_title = seeds.normalized_title
        AND COALESCE(lower(cp.canonical_brand), '') = COALESCE(lower(seeds.vendor), '')
      )
    )
);

-- 3) Create canonical_product_matches junction rows linking each source record to its canonical product.
INSERT INTO public.canonical_product_matches (
  user_id,
  canonical_product_id,
  source_record_id,
  match_method,
  decision,
  confidence_score,
  is_primary,
  decision_notes,
  decided_at
)
SELECT
  psr.user_id,
  cp.id,
  psr.id,
  CASE
    WHEN NULLIF(TRIM(psr.barcode), '') IS NOT NULL AND NULLIF(TRIM(cp.canonical_barcode), '') = NULLIF(TRIM(psr.barcode), '') THEN 'barcode'
    ELSE 'title_brand'
  END,
  CASE
    WHEN NULLIF(TRIM(psr.barcode), '') IS NOT NULL AND NULLIF(TRIM(cp.canonical_barcode), '') = NULLIF(TRIM(psr.barcode), '') THEN 'accepted'
    ELSE 'pending'
  END,
  CASE
    WHEN NULLIF(TRIM(psr.barcode), '') IS NOT NULL AND NULLIF(TRIM(cp.canonical_barcode), '') = NULLIF(TRIM(psr.barcode), '') THEN 95
    ELSE 60
  END,
  NOT EXISTS (
    SELECT 1 FROM public.canonical_product_matches existing
    WHERE existing.canonical_product_id = cp.id AND existing.is_primary = true
  ),
  'Backfilled from existing products table',
  CASE
    WHEN NULLIF(TRIM(psr.barcode), '') IS NOT NULL AND NULLIF(TRIM(cp.canonical_barcode), '') = NULLIF(TRIM(psr.barcode), '') THEN now()
    ELSE NULL
  END
FROM public.product_source_records psr
JOIN public.canonical_products cp
  ON cp.user_id = psr.user_id
 AND (
   (NULLIF(TRIM(psr.barcode), '') IS NOT NULL AND NULLIF(TRIM(cp.canonical_barcode), '') = NULLIF(TRIM(psr.barcode), ''))
   OR (
     NULLIF(TRIM(psr.barcode), '') IS NULL
     AND cp.normalized_title = lower(trim(psr.title))
     AND COALESCE(lower(cp.canonical_brand), '') = COALESCE(lower(psr.vendor), '')
   )
 )
WHERE NOT EXISTS (
  SELECT 1 FROM public.canonical_product_matches cpm WHERE cpm.source_record_id = psr.id
);
