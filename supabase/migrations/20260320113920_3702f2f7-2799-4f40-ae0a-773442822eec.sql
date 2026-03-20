
-- Block 2: Recompute confidence_score, product_scrape_status, and issue_flags for ALL products

-- Step 1: Recompute confidence_score
UPDATE public.products SET
  confidence_score = (
    CASE WHEN title IS NOT NULL AND title <> '' THEN 20 ELSE 0 END
    + CASE WHEN price_min IS NOT NULL AND price_min > 0 THEN 20 ELSE 0 END
    + CASE WHEN vendor IS NOT NULL AND vendor <> '' THEN 10 ELSE 0 END
    + CASE WHEN images IS NOT NULL AND images::text NOT IN ('null', '[]', '{}') THEN 15 ELSE 0 END
    + CASE WHEN body_html IS NOT NULL AND body_html <> '' THEN 15 ELSE 0 END
    + CASE WHEN (
        SELECT COUNT(*) FROM public.product_variants pv 
        WHERE pv.product_id = products.id 
          AND (pv.barcode IS NOT NULL OR pv.sku IS NOT NULL)
      ) > 0 THEN 10 ELSE 0 END
    + CASE WHEN product_scrape_status NOT IN ('discovered') THEN 10 ELSE 0 END
  );

-- Step 2: Recompute issue_flags (clear and re-apply)
UPDATE public.products SET
  issue_flags = (
    ARRAY_REMOVE(ARRAY_REMOVE(ARRAY_REMOVE(ARRAY_REMOVE(ARRAY_REMOVE(
      '{}',
      null), null), null), null), null)
    || CASE WHEN price_min IS NULL OR price_min = 0 THEN ARRAY['missing_price'] ELSE ARRAY[]::text[] END
    || CASE WHEN images IS NULL OR images::text IN ('null', '[]', '{}') THEN ARRAY['missing_image'] ELSE ARRAY[]::text[] END
    || CASE WHEN body_html IS NULL OR body_html = '' THEN ARRAY['missing_description'] ELSE ARRAY[]::text[] END
    || CASE WHEN (
        SELECT COUNT(*) FROM public.product_variants pv 
        WHERE pv.product_id = products.id 
          AND (pv.barcode IS NOT NULL OR pv.sku IS NOT NULL)
      ) = 0 THEN ARRAY['no_barcode'] ELSE ARRAY[]::text[] END
  );

-- Step 3: Recompute product_scrape_status based on new confidence_score
-- First pass: set based on score
UPDATE public.products SET
  product_scrape_status = CASE
    WHEN confidence_score >= 80 THEN 'ready'
    WHEN confidence_score >= 50 THEN 'validated'
    WHEN confidence_score >= 20 THEN 'normalized'
    ELSE 'discovered'
  END;

-- Step 4: Override to 'review_required' for products with critical issue flags
UPDATE public.products SET
  product_scrape_status = 'review_required'
WHERE 
  'missing_price' = ANY(issue_flags)
  OR 'missing_image' = ANY(issue_flags)
  OR confidence_score < 50;

-- Step 5: Add low_confidence flag where score < 50
UPDATE public.products SET
  issue_flags = issue_flags || ARRAY['low_confidence']
WHERE confidence_score < 50
  AND NOT ('low_confidence' = ANY(issue_flags));
