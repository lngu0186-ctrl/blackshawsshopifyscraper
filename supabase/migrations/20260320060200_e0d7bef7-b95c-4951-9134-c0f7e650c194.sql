
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS scrape_strategy text NOT NULL DEFAULT 'products_json',
  ADD COLUMN IF NOT EXISTS storefront_password text,
  ADD COLUMN IF NOT EXISTS storefront_password_hint text,
  ADD COLUMN IF NOT EXISTS requires_auth boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auth_cookie text,
  ADD COLUMN IF NOT EXISTS auth_cookie_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_auth_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS auth_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS auth_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS auth_email text,
  ADD COLUMN IF NOT EXISTS auth_password text,
  ADD COLUMN IF NOT EXISTS auth_token text;
