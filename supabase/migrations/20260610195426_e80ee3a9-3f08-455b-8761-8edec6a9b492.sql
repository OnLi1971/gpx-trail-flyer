ALTER TABLE public.trails ALTER COLUMN river_limit SET DEFAULT 5;
UPDATE public.trails SET river_limit = 5 WHERE river_limit = 0;