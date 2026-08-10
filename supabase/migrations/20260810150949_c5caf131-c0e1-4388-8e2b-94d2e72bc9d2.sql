CREATE TABLE public.tackle_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tackle_category TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tackle_category TO authenticated;
GRANT ALL ON public.tackle_category TO service_role;

ALTER TABLE public.tackle_category ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tackle categories"
  ON public.tackle_category FOR SELECT USING (true);
CREATE POLICY "Admins can insert tackle categories"
  ON public.tackle_category FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update tackle categories"
  ON public.tackle_category FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete tackle categories"
  ON public.tackle_category FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_tackle_category_updated_at
  BEFORE UPDATE ON public.tackle_category
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tackle_subcategory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.tackle_category(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, name)
);

CREATE INDEX idx_tackle_subcategory_category ON public.tackle_subcategory(category_id);

GRANT SELECT ON public.tackle_subcategory TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tackle_subcategory TO authenticated;
GRANT ALL ON public.tackle_subcategory TO service_role;

ALTER TABLE public.tackle_subcategory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tackle subcategories"
  ON public.tackle_subcategory FOR SELECT USING (true);
CREATE POLICY "Admins can insert tackle subcategories"
  ON public.tackle_subcategory FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update tackle subcategories"
  ON public.tackle_subcategory FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete tackle subcategories"
  ON public.tackle_subcategory FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_tackle_subcategory_updated_at
  BEFORE UPDATE ON public.tackle_subcategory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tackle
  ADD COLUMN subcategory_id uuid REFERENCES public.tackle_subcategory(id);

CREATE INDEX idx_tackle_subcategory_id ON public.tackle(subcategory_id);