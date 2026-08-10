CREATE TABLE public.tackle_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tackle_id uuid NOT NULL REFERENCES public.tackle(id) ON DELETE CASCADE,
  color text,
  size text,
  photo_url text,
  notes text,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tackle_variants TO authenticated;
GRANT ALL ON public.tackle_variants TO service_role;

ALTER TABLE public.tackle_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage variants of their own tackle"
ON public.tackle_variants FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tackle t WHERE t.id = tackle_variants.tackle_id AND t.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.tackle t WHERE t.id = tackle_variants.tackle_id AND t.user_id = auth.uid()));

CREATE INDEX idx_tackle_variants_tackle ON public.tackle_variants(tackle_id);
CREATE UNIQUE INDEX idx_tackle_variants_one_primary ON public.tackle_variants(tackle_id) WHERE is_primary;

CREATE OR REPLACE FUNCTION public.validate_tackle_variant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (COALESCE(NULLIF(TRIM(NEW.color), ''), NULL) IS NULL)
     AND (COALESCE(NULLIF(TRIM(NEW.size), ''), NULL) IS NULL) THEN
    RAISE EXCEPTION 'A tackle variant needs at least a color or a size';
  END IF;
  NEW.color := NULLIF(TRIM(COALESCE(NEW.color, '')), '');
  NEW.size := NULLIF(TRIM(COALESCE(NEW.size, '')), '');
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_tackle_variant_trg
BEFORE INSERT OR UPDATE ON public.tackle_variants
FOR EACH ROW EXECUTE FUNCTION public.validate_tackle_variant();

CREATE TRIGGER update_tackle_variants_updated_at
BEFORE UPDATE ON public.tackle_variants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.catches
  ADD COLUMN variant_id uuid REFERENCES public.tackle_variants(id) ON DELETE SET NULL;

CREATE INDEX idx_catches_variant ON public.catches(variant_id);

-- Backfill: one starter variant per existing tackle item
INSERT INTO public.tackle_variants (tackle_id, color, size, photo_url, is_primary, sort_order)
SELECT t.id, 'Original', NULL, t.photo_url, true, 0
FROM public.tackle t
WHERE NOT EXISTS (SELECT 1 FROM public.tackle_variants v WHERE v.tackle_id = t.id);

UPDATE public.catches c
SET variant_id = v.id
FROM public.tackle_variants v
WHERE c.tackle_id = v.tackle_id AND v.is_primary AND c.variant_id IS NULL;