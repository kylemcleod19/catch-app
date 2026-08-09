-- SPECIES ------------------------------------------------------------
CREATE TABLE public.species (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_name text NOT NULL,
  nicknames text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX species_primary_name_lower_idx ON public.species (lower(primary_name));

GRANT SELECT, INSERT ON public.species TO authenticated;
GRANT UPDATE, DELETE ON public.species TO authenticated;
GRANT ALL ON public.species TO service_role;

ALTER TABLE public.species ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read species"
  ON public.species FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed in users can add species"
  ON public.species FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins can update species"
  ON public.species FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete species"
  ON public.species FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_species_updated_at
  BEFORE UPDATE ON public.species
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TACKLE --------------------------------------------------------------
CREATE TABLE public.tackle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'Lure',
  purchase_location text,
  presentation_notes text,
  notes text,
  photo_url text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tackle TO authenticated;
GRANT ALL ON public.tackle TO service_role;

ALTER TABLE public.tackle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tackle"
  ON public.tackle FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own tackle"
  ON public.tackle FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tackle"
  ON public.tackle FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own tackle"
  ON public.tackle FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_tackle_updated_at
  BEFORE UPDATE ON public.tackle
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TACKLE <-> SPECIES ---------------------------------------------------
CREATE TABLE public.tackle_species (
  tackle_id uuid NOT NULL REFERENCES public.tackle(id) ON DELETE CASCADE,
  species_id uuid NOT NULL REFERENCES public.species(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tackle_id, species_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tackle_species TO authenticated;
GRANT ALL ON public.tackle_species TO service_role;

ALTER TABLE public.tackle_species ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage species on their own tackle"
  ON public.tackle_species FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tackle t WHERE t.id = tackle_species.tackle_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tackle t WHERE t.id = tackle_species.tackle_id AND t.user_id = auth.uid()));

-- CATCHES LINKS --------------------------------------------------------
ALTER TABLE public.catches
  ADD COLUMN tackle_id uuid REFERENCES public.tackle(id) ON DELETE SET NULL,
  ADD COLUMN species_id uuid REFERENCES public.species(id) ON DELETE SET NULL;

CREATE INDEX catches_tackle_id_idx ON public.catches (tackle_id);
CREATE INDEX catches_species_id_idx ON public.catches (species_id);
CREATE INDEX tackle_user_id_idx ON public.tackle (user_id);

-- BACKFILL SPECIES FROM EXISTING CATCHES -------------------------------
INSERT INTO public.species (primary_name)
SELECT DISTINCT ON (lower(btrim(c.species))) btrim(c.species)
FROM public.catches c
WHERE c.species IS NOT NULL AND btrim(c.species) <> ''
ORDER BY lower(btrim(c.species)), btrim(c.species);

UPDATE public.catches c
SET species_id = s.id
FROM public.species s
WHERE lower(btrim(c.species)) = lower(s.primary_name)
  AND c.species_id IS NULL;

-- DROP UNUSED GEAR TABLE ----------------------------------------------
DROP TABLE IF EXISTS public.gear;