ALTER TABLE public.product_catalog
  ADD COLUMN IF NOT EXISTS ml_price numeric,
  ADD COLUMN IF NOT EXISTS ml_url text,
  ADD COLUMN IF NOT EXISTS ml_updated_at timestamptz;