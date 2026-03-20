
-- Stores table
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  normalized_url text NOT NULL,
  myshopify_domain text,
  enabled boolean NOT NULL DEFAULT true,
  validation_status text NOT NULL DEFAULT 'valid',
  last_scraped_at timestamptz,
  total_products integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stores_user_id_normalized_url_key UNIQUE (user_id, normalized_url)
);

-- Products table
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  store_name text NOT NULL,
  store_slug text NOT NULL,
  handle text NOT NULL,
  store_handle text NOT NULL,
  title text NOT NULL,
  body_html text,
  body_plain text,
  vendor text,
  product_type text,
  tags text,
  published boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  url text,
  images jsonb,
  options jsonb,
  raw_product jsonb,
  price_min numeric(10,2),
  price_max numeric(10,2),
  compare_at_price_min numeric(10,2),
  compare_at_price_max numeric(10,2),
  shopify_product_id text,
  shopify_created_at timestamptz,
  shopify_updated_at timestamptz,
  shopify_published_at timestamptz,
  scraped_at timestamptz,
  content_hash text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_changed_at timestamptz,
  last_exported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_store_id_handle_key UNIQUE (store_id, handle),
  CONSTRAINT products_user_id_store_handle_key UNIQUE (user_id, store_handle)
);

-- Product variants table
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  shopify_variant_id text NOT NULL,
  variant_position integer,
  variant_title text,
  sku text,
  barcode text,
  option1 text,
  option2 text,
  option3 text,
  price numeric(10,2),
  compare_at_price numeric(10,2),
  grams integer NOT NULL DEFAULT 0,
  taxable boolean NOT NULL DEFAULT true,
  requires_shipping boolean NOT NULL DEFAULT true,
  fulfillment_service text NOT NULL DEFAULT 'manual',
  inventory_policy text NOT NULL DEFAULT 'deny',
  inventory_tracker text,
  inventory_quantity integer,
  featured_image_url text,
  raw_variant jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_product_id_shopify_variant_id_key UNIQUE (product_id, shopify_variant_id)
);

-- Scrape runs table
CREATE TABLE IF NOT EXISTS public.scrape_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  total_stores integer NOT NULL DEFAULT 0,
  completed_stores integer NOT NULL DEFAULT 0,
  total_products integer NOT NULL DEFAULT 0,
  total_price_changes integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  settings jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Scrape run stores table
CREATE TABLE IF NOT EXISTS public.scrape_run_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_run_id uuid NOT NULL REFERENCES public.scrape_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  page_count integer NOT NULL DEFAULT 0,
  product_count integer NOT NULL DEFAULT 0,
  price_changes integer NOT NULL DEFAULT 0,
  message text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Scrape logs table
CREATE TABLE IF NOT EXISTS public.scrape_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scrape_run_id uuid NOT NULL REFERENCES public.scrape_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Variant price history table
CREATE TABLE IF NOT EXISTS public.variant_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  store_handle text NOT NULL,
  shopify_variant_id text NOT NULL,
  variant_sku text,
  variant_title text,
  price numeric(10,2),
  compare_at_price numeric(10,2),
  previous_price numeric(10,2),
  previous_compare_at_price numeric(10,2),
  price_delta numeric(10,2),
  price_delta_pct numeric(10,4),
  compare_at_price_delta numeric(10,2),
  price_changed boolean NOT NULL DEFAULT false,
  compare_at_price_changed boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  scrape_run_id uuid REFERENCES public.scrape_runs(id) ON DELETE SET NULL
);

-- Export runs table
CREATE TABLE IF NOT EXISTS public.export_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'all',
  store_ids jsonb,
  changed_only boolean NOT NULL DEFAULT false,
  export_type text NOT NULL DEFAULT 'shopify_csv',
  row_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Store metrics history table
CREATE TABLE IF NOT EXISTS public.store_metrics_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  total_products integer NOT NULL DEFAULT 0,
  price_changes integer NOT NULL DEFAULT 0,
  avg_price_min numeric(10,2)
);

-- Indexes
CREATE INDEX IF NOT EXISTS stores_user_id_idx ON public.stores(user_id);
CREATE INDEX IF NOT EXISTS products_user_id_store_id_idx ON public.products(user_id, store_id);
CREATE INDEX IF NOT EXISTS products_user_id_title_idx ON public.products(user_id, title);
CREATE INDEX IF NOT EXISTS products_user_id_product_type_idx ON public.products(user_id, product_type);
CREATE INDEX IF NOT EXISTS products_user_id_vendor_idx ON public.products(user_id, vendor);
CREATE INDEX IF NOT EXISTS products_user_id_scraped_at_idx ON public.products(user_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON public.product_variants(product_id, shopify_variant_id);
CREATE INDEX IF NOT EXISTS variant_price_history_product_id_idx ON public.variant_price_history(product_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS variant_price_history_variant_id_idx ON public.variant_price_history(variant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS variant_price_history_user_price_changed_idx ON public.variant_price_history(user_id, price_changed, recorded_at DESC);
CREATE INDEX IF NOT EXISTS scrape_logs_run_id_created_at_idx ON public.scrape_logs(scrape_run_id, created_at);
CREATE INDEX IF NOT EXISTS store_metrics_history_store_id_idx ON public.store_metrics_history(store_id, snapshot_at DESC);

-- RLS
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_run_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variant_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_metrics_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stores_user_policy" ON public.stores FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "products_user_policy" ON public.products FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "product_variants_user_policy" ON public.product_variants FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "scrape_runs_user_policy" ON public.scrape_runs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "scrape_run_stores_user_policy" ON public.scrape_run_stores FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "scrape_logs_user_policy" ON public.scrape_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "variant_price_history_user_policy" ON public.variant_price_history FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "export_runs_user_policy" ON public.export_runs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "store_metrics_history_user_policy" ON public.store_metrics_history FOR ALL USING (auth.uid() = user_id);

-- updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER scrape_runs_updated_at BEFORE UPDATE ON public.scrape_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER scrape_run_stores_updated_at BEFORE UPDATE ON public.scrape_run_stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
