-- Lançamento de km e abastecimento pelo celular (técnico/motorista): guarda quem registrou.
-- created_by é o usuário logado (auth.uid()) e created_by_name o nome mostrado no painel.
ALTER TABLE public.vehicle_km_logs ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT auth.uid()::text;
ALTER TABLE public.vehicle_km_logs ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE public.vehicle_fuel_logs ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT auth.uid()::text;
ALTER TABLE public.vehicle_fuel_logs ADD COLUMN IF NOT EXISTS created_by_name TEXT;
