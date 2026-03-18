
ALTER TABLE public.fishing_trips ADD COLUMN status text NOT NULL DEFAULT 'completed';

ALTER TABLE public.catches ADD COLUMN quantity integer NOT NULL DEFAULT 1;

ALTER TABLE public.catches DROP CONSTRAINT IF EXISTS catches_trip_id_fkey;
ALTER TABLE public.catches ADD CONSTRAINT catches_trip_id_fkey 
  FOREIGN KEY (trip_id) REFERENCES public.fishing_trips(id) ON DELETE CASCADE;
