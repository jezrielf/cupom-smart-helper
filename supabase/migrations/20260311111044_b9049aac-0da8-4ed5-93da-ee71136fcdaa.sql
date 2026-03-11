
-- ==========================================
-- CupomSmart MG — Full Database Schema
-- ==========================================

-- 1. Enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- 2. Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 3. Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. Supermarkets table
CREATE TABLE public.supermarkets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cnpj TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  trade_name TEXT,
  address TEXT,
  city TEXT,
  neighborhood TEXT,
  state TEXT DEFAULT 'MG',
  brand_color TEXT DEFAULT '#3b82f6',
  logo_url TEXT,
  is_favorite BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.supermarkets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read supermarkets" ON public.supermarkets FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert supermarkets" ON public.supermarkets FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update supermarkets" ON public.supermarkets FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_supermarkets_name ON public.supermarkets(name);

CREATE TRIGGER update_supermarkets_updated_at BEFORE UPDATE ON public.supermarkets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Receipts table
CREATE TABLE public.receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supermarket_id UUID REFERENCES public.supermarkets(id),
  access_key TEXT NOT NULL UNIQUE,
  qr_code_url TEXT,
  purchase_date TIMESTAMP WITH TIME ZONE NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_discount NUMERIC(12, 2) DEFAULT 0,
  payment_method TEXT,
  item_count INTEGER DEFAULT 0,
  raw_html TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own receipts" ON public.receipts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own receipts" ON public.receipts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own receipts" ON public.receipts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own receipts" ON public.receipts FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_receipts_supermarket_id ON public.receipts(supermarket_id);
CREATE INDEX idx_receipts_purchase_date ON public.receipts(purchase_date);
CREATE INDEX idx_receipts_user_id ON public.receipts(user_id);

CREATE TRIGGER update_receipts_updated_at BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Products table (items from receipts)
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  supermarket_id UUID REFERENCES public.supermarkets(id),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_code TEXT,
  product_name TEXT NOT NULL,
  product_name_normalized TEXT NOT NULL,
  unit TEXT DEFAULT 'UN',
  quantity NUMERIC(12, 4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 4) NOT NULL DEFAULT 0,
  total_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  purchase_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own products" ON public.products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own products" ON public.products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own products" ON public.products FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_products_receipt_id ON public.products(receipt_id);
CREATE INDEX idx_products_product_code ON public.products(product_code);
CREATE INDEX idx_products_product_name_normalized ON public.products(product_name_normalized);
CREATE INDEX idx_products_supermarket_id ON public.products(supermarket_id);
CREATE INDEX idx_products_purchase_date ON public.products(purchase_date);

-- 8. Price history table
CREATE TABLE public.price_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_code TEXT,
  product_name_normalized TEXT NOT NULL,
  supermarket_id UUID NOT NULL REFERENCES public.supermarkets(id),
  unit_price NUMERIC(12, 4) NOT NULL,
  purchase_date TIMESTAMP WITH TIME ZONE NOT NULL,
  price_change_absolute NUMERIC(12, 4),
  price_change_percent NUMERIC(8, 2),
  price_trend TEXT DEFAULT 'stable',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read price history" ON public.price_history FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert price history" ON public.price_history FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_price_history_composite ON public.price_history(product_code, supermarket_id, purchase_date);
CREATE INDEX idx_price_history_name ON public.price_history(product_name_normalized);

-- 9. Product catalog (global unique products)
CREATE TABLE public.product_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_code TEXT,
  canonical_name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  category TEXT,
  unit TEXT DEFAULT 'UN',
  is_essential BOOLEAN DEFAULT false,
  avg_price NUMERIC(12, 4),
  min_price NUMERIC(12, 4),
  max_price NUMERIC(12, 4),
  cheapest_supermarket_id UUID REFERENCES public.supermarkets(id),
  times_purchased INTEGER DEFAULT 0,
  last_purchased_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read product catalog" ON public.product_catalog FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert product catalog" ON public.product_catalog FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update product catalog" ON public.product_catalog FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_product_catalog_updated_at BEFORE UPDATE ON public.product_catalog FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Shopping lists
CREATE TABLE public.shopping_lists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Minha Lista',
  target_supermarket_id UUID REFERENCES public.supermarkets(id),
  planned_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lists" ON public.shopping_lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own lists" ON public.shopping_lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own lists" ON public.shopping_lists FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own lists" ON public.shopping_lists FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_shopping_lists_updated_at BEFORE UPDATE ON public.shopping_lists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. Shopping list items
CREATE TABLE public.shopping_list_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shopping_list_id UUID NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_catalog_id UUID REFERENCES public.product_catalog(id),
  product_name TEXT NOT NULL,
  quantity NUMERIC(12, 4) DEFAULT 1,
  unit TEXT DEFAULT 'UN',
  priority TEXT DEFAULT 'medium',
  estimated_price NUMERIC(12, 2),
  is_checked BOOLEAN DEFAULT false,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own list items" ON public.shopping_list_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own list items" ON public.shopping_list_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own list items" ON public.shopping_list_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own list items" ON public.shopping_list_items FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_shopping_list_items_list_id ON public.shopping_list_items(shopping_list_id);

CREATE TRIGGER update_shopping_list_items_updated_at BEFORE UPDATE ON public.shopping_list_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. Storage bucket for supermarket logos
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('supermarket-logos', 'supermarket-logos', true, 2097152);

CREATE POLICY "Anyone can view supermarket logos" ON storage.objects FOR SELECT USING (bucket_id = 'supermarket-logos');
CREATE POLICY "Authenticated users can upload supermarket logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'supermarket-logos' AND auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update supermarket logos" ON storage.objects FOR UPDATE USING (bucket_id = 'supermarket-logos' AND auth.uid() IS NOT NULL);

-- 13. Enable realtime for receipts and shopping_list_items
ALTER PUBLICATION supabase_realtime ADD TABLE public.receipts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_list_items;

-- 14. Materialized view for price comparison
CREATE MATERIALIZED VIEW public.price_comparison_view AS
SELECT
  ph.product_name_normalized,
  ph.product_code,
  ph.supermarket_id,
  s.name AS supermarket_name,
  s.brand_color,
  s.logo_url,
  COUNT(*) AS times_purchased,
  AVG(ph.unit_price) AS avg_price,
  MIN(ph.unit_price) AS min_price,
  MAX(ph.unit_price) AS max_price,
  (ARRAY_AGG(ph.unit_price ORDER BY ph.purchase_date DESC))[1] AS last_price,
  MAX(ph.purchase_date) AS last_purchase_date,
  AVG(ph.unit_price) FILTER (WHERE ph.purchase_date >= now() - INTERVAL '30 days') AS avg_price_30d,
  AVG(ph.unit_price) FILTER (WHERE ph.purchase_date >= now() - INTERVAL '90 days') AS avg_price_90d
FROM public.price_history ph
JOIN public.supermarkets s ON s.id = ph.supermarket_id
GROUP BY ph.product_name_normalized, ph.product_code, ph.supermarket_id, s.name, s.brand_color, s.logo_url;

CREATE UNIQUE INDEX idx_price_comparison_view ON public.price_comparison_view(product_name_normalized, supermarket_id);
