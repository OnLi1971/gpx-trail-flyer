ALTER TABLE public.trails
ADD COLUMN IF NOT EXISTS place_selection_mode text NOT NULL DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS selected_place_keys jsonb NOT NULL DEFAULT '[]'::jsonb;