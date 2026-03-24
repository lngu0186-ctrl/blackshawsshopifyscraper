-- Phase 2 groundwork: run observability + additive canonical schema foundation

-- ── Run observability fields ───────────────────────────────────────────────
ALTER TABLE public.scrape_runs
  ADD COLUMN IF NOT EXISTS active_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_store_name text,
  ADD COLUMN IF NOT EXISTS latest_message text,
  ADD COLUMN IF NOT EXISTS collections_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collections_completed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collections_failed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collections_skipped integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_scrape_runs_active_store_id ON public.scrape_runs(active_store_id);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_last_event_at ON public.scrape_runs(last_event_at DESC);

-- ── Canonical groundwork: source records + match junctions ─────────────────
CREATE TABLE IF NOT EXISTS public.canonical_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  normalized_title text,
  canonical_brand text,
  canonical_barcode text,
  barcode_confidence text DEFAULT 'unknown',
  product_type text,
  primary_image_url text,
  canonical_description text,
  match_status text NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'auto_matched', 'review_required', 'confirmed', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canonical_products_user_id ON public.canonical_products(user_id);
CREATE INDEX IF NOT EXISTS idx_canonical_products_barcode ON public.canonical_products(canonical_barcode);
CREATE INDEX IF NOT EXISTS idx_canonical_products_match_status ON public.canonical_products(match_status);

CREATE TABLE IF NOT EXISTS public.product_source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  source_kind text NOT NULL DEFAULT 'store_scrape' CHECK (source_kind IN ('store_scrape', 'supplier_file', 'manual', 'api_import')),
  source_name text,
  source_record_key text,
  source_url text,
  title text,
  vendor text,
  barcode text,
  sku text,
  product_type text,
  price_min numeric,
  image_url text,
  description_text text,
  raw_payload jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_source_records_user_id ON public.product_source_records(user_id);
CREATE INDEX IF NOT EXISTS idx_product_source_records_store_id ON public.product_source_records(store_id);
CREATE INDEX IF NOT EXISTS idx_product_source_records_product_id ON public.product_source_records(product_id);
CREATE INDEX IF NOT EXISTS idx_product_source_records_source_kind ON public.product_source_records(source_kind);
CREATE INDEX IF NOT EXISTS idx_product_source_records_barcode ON public.product_source_records(barcode);

CREATE TABLE IF NOT EXISTS public.canonical_product_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  canonical_product_id uuid NOT NULL REFERENCES public.canonical_products(id) ON DELETE CASCADE,
  source_record_id uuid NOT NULL REFERENCES public.product_source_records(id) ON DELETE CASCADE,
  match_method text NOT NULL DEFAULT 'heuristic' CHECK (match_method IN ('barcode', 'sku', 'title_brand', 'heuristic', 'manual')),
  decision text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'accepted', 'rejected')),
  confidence_score integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  decision_notes text,
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canonical_product_id, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_canonical_product_matches_user_id ON public.canonical_product_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_canonical_product_matches_canonical ON public.canonical_product_matches(canonical_product_id);
CREATE INDEX IF NOT EXISTS idx_canonical_product_matches_source ON public.canonical_product_matches(source_record_id);
CREATE INDEX IF NOT EXISTS idx_canonical_product_matches_decision ON public.canonical_product_matches(decision);

ALTER TABLE public.canonical_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canonical_product_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canonical_products_user_policy ON public.canonical_products;
CREATE POLICY canonical_products_user_policy ON public.canonical_products FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS product_source_records_user_policy ON public.product_source_records;
CREATE POLICY product_source_records_user_policy ON public.product_source_records FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS canonical_product_matches_user_policy ON public.canonical_product_matches;
CREATE POLICY canonical_product_matches_user_policy ON public.canonical_product_matches FOR ALL USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS canonical_products_updated_at ON public.canonical_products;
CREATE TRIGGER canonical_products_updated_at BEFORE UPDATE ON public.canonical_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS product_source_records_updated_at ON public.product_source_records;
CREATE TRIGGER product_source_records_updated_at BEFORE UPDATE ON public.product_source_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS canonical_product_matches_updated_at ON public.canonical_product_matches;
CREATE TRIGGER canonical_product_matches_updated_at BEFORE UPDATE ON public.canonical_product_matches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
