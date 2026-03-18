
-- Create spots table
CREATE TABLE public.spots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT,
  body_of_water TEXT NOT NULL,
  state_code TEXT NOT NULL,
  site_type TEXT NOT NULL DEFAULT 'Stream',
  usgs_site_id TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create spot_points table
CREATE TABLE public.spot_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_id UUID NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Pin',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add spot_id to fishing_trips
ALTER TABLE public.fishing_trips ADD COLUMN spot_id UUID REFERENCES public.spots(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spot_points ENABLE ROW LEVEL SECURITY;

-- Spots RLS
CREATE POLICY "Users can view their own spots" ON public.spots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own spots" ON public.spots FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own spots" ON public.spots FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own spots" ON public.spots FOR DELETE USING (auth.uid() = user_id);

-- Spot points RLS (user owns the parent spot)
CREATE POLICY "Users can view their spot points" ON public.spot_points FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.spots WHERE spots.id = spot_points.spot_id AND spots.user_id = auth.uid())
);
CREATE POLICY "Users can create spot points" ON public.spot_points FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.spots WHERE spots.id = spot_points.spot_id AND spots.user_id = auth.uid())
);
CREATE POLICY "Users can update their spot points" ON public.spot_points FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.spots WHERE spots.id = spot_points.spot_id AND spots.user_id = auth.uid())
);
CREATE POLICY "Users can delete their spot points" ON public.spot_points FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.spots WHERE spots.id = spot_points.spot_id AND spots.user_id = auth.uid())
);

-- Trigger for updated_at on spots
CREATE TRIGGER update_spots_updated_at BEFORE UPDATE ON public.spots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
