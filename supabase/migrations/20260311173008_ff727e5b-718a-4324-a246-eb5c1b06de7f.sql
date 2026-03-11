ALTER TABLE public.product_catalog
  ADD COLUMN IF NOT EXISTS ifood_price numeric,
  ADD COLUMN IF NOT EXISTS ifood_url text,
  ADD COLUMN IF NOT EXISTS ifood_updated_at timestamptz;