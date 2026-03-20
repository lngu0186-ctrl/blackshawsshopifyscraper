
-- Extend scraped_products with identifier and edit fields
ALTER TABLE scraped_products
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS ean text,
  ADD COLUMN IF NOT EXISTS upc text,
  ADD COLUMN IF NOT EXISTS mpn text,
  ADD COLUMN IF NOT EXISTS raw_identifiers jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS override_fields jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS edited_fields jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_manually_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS auth_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auth_blocked_fields text[] DEFAULT '{}';

-- Extend scrape_diagnostics
ALTER TABLE scrape_diagnostics
  ADD COLUMN IF NOT EXISTS auth_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auth_status_detail text,
  ADD COLUMN IF NOT EXISTS auth_blocked_fields text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS export_truncated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS configured_limit_hit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS limit_name text,
  ADD COLUMN IF NOT EXISTS limit_value integer;

-- Extend stores
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS auth_blocked_reason text,
  ADD COLUMN IF NOT EXISTS last_auth_at timestamptz;

-- Edit history
CREATE TABLE IF NOT EXISTS product_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  edit_source text NOT NULL DEFAULT 'user',
  edited_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_edit_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'product_edit_history' AND policyname = 'peh_user'
  ) THEN
    CREATE POLICY peh_user ON product_edit_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

-- Scraper settings for configurable limits
CREATE TABLE IF NOT EXISTS scraper_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  max_pages_per_source integer NOT NULL DEFAULT 999,
  max_products_per_run integer NOT NULL DEFAULT 999999,
  max_concurrent_enrichments integer NOT NULL DEFAULT 5,
  max_export_rows integer NOT NULL DEFAULT 999999,
  enrichment_batch_size integer NOT NULL DEFAULT 50,
  inter_request_delay_ms integer NOT NULL DEFAULT 800,
  UNIQUE(user_id)
);

ALTER TABLE scraper_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scraper_settings' AND policyname = 'ss_user'
  ) THEN
    CREATE POLICY ss_user ON scraper_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_scraped_products_barcode ON scraped_products(user_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scraped_products_auth_blocked ON scraped_products(user_id, auth_blocked);
CREATE INDEX IF NOT EXISTS idx_scraped_products_review_status ON scraped_products(user_id, review_status);
