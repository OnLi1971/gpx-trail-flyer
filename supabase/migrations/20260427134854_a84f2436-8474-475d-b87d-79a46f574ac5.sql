-- Cache POI dat (vrcholy + obce) k trase, aby se nemuselo opakovaně volat Overpass API
ALTER TABLE public.trails
  ADD COLUMN IF NOT EXISTS cached_pois jsonb,
  ADD COLUMN IF NOT EXISTS pois_cached_at timestamptz;