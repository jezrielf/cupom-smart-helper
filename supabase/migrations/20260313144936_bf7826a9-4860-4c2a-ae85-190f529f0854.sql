ALTER TABLE public.product_catalog 
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS weight_g numeric,
  ADD COLUMN IF NOT EXISTS ai_category text;