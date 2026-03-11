
-- Fix: Revoke API access to materialized view (it should only be accessed via SQL/functions)
REVOKE ALL ON public.price_comparison_view FROM anon, authenticated;

-- Create a function to query the view instead
CREATE OR REPLACE FUNCTION public.get_price_comparison(search_term TEXT DEFAULT NULL)
RETURNS TABLE (
  product_name_normalized TEXT,
  product_code TEXT,
  supermarket_id UUID,
  supermarket_name TEXT,
  brand_color TEXT,
  logo_url TEXT,
  times_purchased BIGINT,
  avg_price NUMERIC,
  min_price NUMERIC,
  max_price NUMERIC,
  last_price NUMERIC,
  last_purchase_date TIMESTAMPTZ,
  avg_price_30d NUMERIC,
  avg_price_90d NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.price_comparison_view
  WHERE search_term IS NULL OR product_name_normalized ILIKE '%' || search_term || '%'
  ORDER BY product_name_normalized, supermarket_name;
$$;
