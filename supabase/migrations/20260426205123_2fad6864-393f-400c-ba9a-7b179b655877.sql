-- Tabulka tras
CREATE TABLE public.trails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  gpx_data JSONB NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trails_user_id ON public.trails(user_id);
CREATE INDEX idx_trails_slug ON public.trails(slug);

-- Tabulka fotek v trasách
CREATE TABLE public.trail_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trail_id UUID NOT NULL REFERENCES public.trails(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  photo_timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trail_photos_trail_id ON public.trail_photos(trail_id);

-- Trigger pro updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trails_updated_at
BEFORE UPDATE ON public.trails
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS na trails
ALTER TABLE public.trails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner sees own trails"
ON public.trails FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Anyone sees public trails"
ON public.trails FOR SELECT
TO anon, authenticated
USING (is_public = true);

CREATE POLICY "Owner inserts trails"
ON public.trails FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner updates trails"
ON public.trails FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Owner deletes trails"
ON public.trails FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- RLS na trail_photos
ALTER TABLE public.trail_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner sees own trail photos"
ON public.trail_photos FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.trails t WHERE t.id = trail_id AND t.user_id = auth.uid()));

CREATE POLICY "Anyone sees photos of public trails"
ON public.trail_photos FOR SELECT
TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.trails t WHERE t.id = trail_id AND t.is_public = true));

CREATE POLICY "Owner inserts trail photos"
ON public.trail_photos FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.trails t WHERE t.id = trail_id AND t.user_id = auth.uid()));

CREATE POLICY "Owner updates trail photos"
ON public.trail_photos FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.trails t WHERE t.id = trail_id AND t.user_id = auth.uid()));

CREATE POLICY "Owner deletes trail photos"
ON public.trail_photos FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.trails t WHERE t.id = trail_id AND t.user_id = auth.uid()));

-- Storage bucket pro fotky
INSERT INTO storage.buckets (id, name, public)
VALUES ('trail-photos', 'trail-photos', true);

-- Storage policies: čtení veřejné, zápis jen do vlastní složky uživatele (user_id/...)
CREATE POLICY "Public read trail photos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'trail-photos');

CREATE POLICY "Users upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'trail-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'trail-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'trail-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);