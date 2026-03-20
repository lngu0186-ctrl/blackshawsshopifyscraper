
-- scraped_products — universal enriched product record
CREATE TABLE IF NOT EXISTS public.scraped_products (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_key            text NOT NULL,
  source_name           text NOT NULL,
  source_url            text NOT NULL,
  external_id           text,
  sku                   text,
  gtin                  text,
  title                 text NOT NULL,
  brand                 text,
  category              text,
  category_path         text[] NOT NULL DEFAULT '{}',
  description_html      text,
  description_plain     text,
  price                 numeric(10,2),
  was_price             numeric(10,2),
  currency              text NOT NULL DEFAULT 'AUD',
  price_text            text,
  image_url             text,
  image_urls            text[] NOT NULL DEFAULT '{}',
  in_stock              boolean,
  availability_text     text,
  size_text             text,
  tags                  text[] NOT NULL DEFAULT '{}',
  scrape_method         text NOT NULL DEFAULT 'unknown',
  listing_scraped       boolean NOT NULL DEFAULT false,
  detail_scraped        boolean NOT NULL DEFAULT false,
  detail_fetch_attempts integer NOT NULL DEFAULT 0,
  detail_fetch_error    text,
  confidence_score      integer NOT NULL DEFAULT 0,
  missing_fields        text[] NOT NULL DEFAULT '{}',
  scrape_status         text NOT NULL DEFAULT 'partial',
  raw_listing           jsonb,
  raw_detail            jsonb,
  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  scraped_at            timestamptz NOT NULL DEFAULT now(),
  enriched_at           timestamptz,
  last_exported_at      timestamptz,
  UNIQUE(user_id, source_key, source_url)
);

CREATE INDEX IF NOT EXISTS idx_scraped_products_user_source ON public.scraped_products(user_id, source_key);
CREATE INDEX IF NOT EXISTS idx_scraped_products_user_status ON public.scraped_products(user_id, scrape_status);
CREATE INDEX IF NOT EXISTS idx_scraped_products_user_confidence ON public.scraped_products(user_id, confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_scraped_products_null_price ON public.scraped_products(user_id, price) WHERE price IS NULL;
CREATE INDEX IF NOT EXISTS idx_scraped_products_unenriched ON public.scraped_products(user_id, source_key) WHERE detail_scraped = false;

ALTER TABLE public.scraped_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_user ON public.scraped_products USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- scrape_jobs — tracks Phase 1 + Phase 2 job progress
CREATE TABLE IF NOT EXISTS public.scrape_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_key        text NOT NULL,
  job_type          text NOT NULL DEFAULT 'full',
  status            text NOT NULL DEFAULT 'queued',
  total_discovered  integer NOT NULL DEFAULT 0,
  total_enriched    integer NOT NULL DEFAULT 0,
  total_failed      integer NOT NULL DEFAULT 0,
  started_at        timestamptz,
  finished_at       timestamptz,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrape_jobs_user ON public.scrape_jobs(user_id, created_at DESC);

ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY sj_user ON public.scrape_jobs USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
