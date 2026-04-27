ALTER TABLE public.trails 
ADD COLUMN IF NOT EXISTS peak_limit integer NOT NULL DEFAULT 25,
ADD COLUMN IF NOT EXISTS place_limit integer NOT NULL DEFAULT 15,
ADD COLUMN IF NOT EXISTS peak_selection_mode text NOT NULL DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS selected_peak_keys jsonb NOT NULL DEFAULT '[]'::jsonb;