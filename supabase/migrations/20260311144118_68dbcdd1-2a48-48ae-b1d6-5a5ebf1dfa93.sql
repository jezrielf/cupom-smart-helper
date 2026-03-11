ALTER TABLE product_catalog
  ADD COLUMN online_price numeric,
  ADD COLUMN online_url text,
  ADD COLUMN online_updated_at timestamptz;