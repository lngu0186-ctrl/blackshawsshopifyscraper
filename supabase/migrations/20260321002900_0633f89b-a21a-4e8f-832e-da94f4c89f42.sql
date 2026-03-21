
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.cw_import_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name       text NOT NULL,
  status          text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','parsing','review','importing','completed','failed')),
  total_rows      integer NOT NULL DEFAULT 0,
  matched_rows    integer NOT NULL DEFAULT 0,
  new_rows        integer NOT NULL DEFAULT 0,
  ambiguous_rows  integer NOT NULL DEFAULT 0,
  invalid_rows    integer NOT NULL DEFAULT 0,
  skipped_rows    integer NOT NULL DEFAULT 0,
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  error_summary   text
);
CREATE INDEX IF NOT EXISTS idx_cw_import_jobs_created_by ON public.cw_import_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_cw_import_jobs_status ON public.cw_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_cw_import_jobs_created_at ON public.cw_import_jobs(created_at DESC);
ALTER TABLE public.cw_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cw_import_jobs_select" ON public.cw_import_jobs FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "cw_import_jobs_insert" ON public.cw_import_jobs FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "cw_import_jobs_update" ON public.cw_import_jobs FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "cw_import_jobs_delete" ON public.cw_import_jobs FOR DELETE USING (auth.uid() = created_by);
DROP TRIGGER IF EXISTS trg_cw_import_jobs_updated_at ON public.cw_import_jobs;
CREATE TRIGGER trg_cw_import_jobs_updated_at BEFORE UPDATE ON public.cw_import_jobs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.cw_import_rows (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id       uuid NOT NULL REFERENCES public.cw_import_jobs(id) ON DELETE CASCADE,
  row_number          integer NOT NULL,
  raw_data            jsonb NOT NULL DEFAULT '{}',
  cw_url              text,
  cw_product_id       text,
  cw_sku              text,
  cw_slug             text,
  cw_name             text,
  cw_brand            text,
  cw_price_cents      numeric,
  cw_rrp_cents        numeric,
  cw_currency         text,
  cw_in_stock         boolean,
  cw_category_path    text,
  cw_image_url        text,
  cw_review_rating    numeric,
  cw_review_count     integer,
  cw_source           text,
  cw_updated_at       timestamptz,
  normalized_name     text,
  normalized_brand    text,
  normalized_slug     text,
  validation_errors   jsonb NOT NULL DEFAULT '[]',
  match_status        text NOT NULL DEFAULT 'new' CHECK (match_status IN ('matched','new','ambiguous','invalid','skipped')),
  match_method        text,
  match_confidence    numeric,
  matched_record_id   uuid,
  candidate_matches   jsonb NOT NULL DEFAULT '[]',
  resolution_action   text CHECK (resolution_action IN ('update','create','skip','manual_link')),
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cw_import_rows_job ON public.cw_import_rows(import_job_id);
CREATE INDEX IF NOT EXISTS idx_cw_import_rows_job_status ON public.cw_import_rows(import_job_id, match_status);
CREATE INDEX IF NOT EXISTS idx_cw_import_rows_url ON public.cw_import_rows(cw_url);
CREATE INDEX IF NOT EXISTS idx_cw_import_rows_sku ON public.cw_import_rows(cw_sku);
CREATE INDEX IF NOT EXISTS idx_cw_import_rows_product_id ON public.cw_import_rows(cw_product_id);
CREATE INDEX IF NOT EXISTS idx_cw_import_rows_norm_name ON public.cw_import_rows(normalized_name);
CREATE INDEX IF NOT EXISTS idx_cw_import_rows_norm_brand ON public.cw_import_rows(normalized_brand);
ALTER TABLE public.cw_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cw_import_rows_select" ON public.cw_import_rows FOR SELECT USING (import_job_id IN (SELECT id FROM public.cw_import_jobs WHERE created_by = auth.uid()));
CREATE POLICY "cw_import_rows_insert" ON public.cw_import_rows FOR INSERT WITH CHECK (import_job_id IN (SELECT id FROM public.cw_import_jobs WHERE created_by = auth.uid()));
CREATE POLICY "cw_import_rows_update" ON public.cw_import_rows FOR UPDATE USING (import_job_id IN (SELECT id FROM public.cw_import_jobs WHERE created_by = auth.uid()));
CREATE POLICY "cw_import_rows_delete" ON public.cw_import_rows FOR DELETE USING (import_job_id IN (SELECT id FROM public.cw_import_jobs WHERE created_by = auth.uid()));
DROP TRIGGER IF EXISTS trg_cw_import_rows_updated_at ON public.cw_import_rows;
CREATE TRIGGER trg_cw_import_rows_updated_at BEFORE UPDATE ON public.cw_import_rows FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.cw_products (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cw_product_id    text NOT NULL UNIQUE,
  cw_sku           text,
  cw_slug          text,
  cw_url           text,
  name             text NOT NULL,
  brand            text,
  price_cents      numeric,
  rrp_cents        numeric,
  currency         text DEFAULT 'AUD',
  in_stock         boolean,
  category_path    text,
  image_url        text,
  review_rating    numeric,
  review_count     integer,
  cw_source        text,
  cw_updated_at    timestamptz,
  last_imported_at timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cw_products_cw_product_id ON public.cw_products(cw_product_id);
CREATE INDEX IF NOT EXISTS idx_cw_products_cw_sku ON public.cw_products(cw_sku);
CREATE INDEX IF NOT EXISTS idx_cw_products_brand ON public.cw_products(brand);
CREATE INDEX IF NOT EXISTS idx_cw_products_name ON public.cw_products(name);
ALTER TABLE public.cw_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cw_products_select" ON public.cw_products FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cw_products_insert" ON public.cw_products FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "cw_products_update" ON public.cw_products FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "cw_products_delete" ON public.cw_products FOR DELETE USING (auth.uid() IS NOT NULL);
DROP TRIGGER IF EXISTS trg_cw_products_updated_at ON public.cw_products;
CREATE TRIGGER trg_cw_products_updated_at BEFORE UPDATE ON public.cw_products FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
