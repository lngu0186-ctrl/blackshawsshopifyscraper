-- Add extended qualification columns to stores table
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS platform text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS platform_confidence text,
  ADD COLUMN IF NOT EXISTS scrapeability_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reachability_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS qualification_notes text,
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS store_type text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS antibot_suspected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS login_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sitemap_found boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sitemap_url text;

CREATE INDEX IF NOT EXISTS idx_stores_store_type ON public.stores(store_type);
CREATE INDEX IF NOT EXISTS idx_stores_platform ON public.stores(platform);