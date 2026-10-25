-- Abastecimento: vínculo com a rota e local onde foi abastecido (GPS do celular).
-- route_id é TEXT como em routes.id (ver 01_alter_schema_to_text.sql). A coluna card_last4 (27) deixou de ser
-- usada pelo app; continua na tabela só para não apagar dados.
ALTER TABLE public.vehicle_fuel_logs ADD COLUMN IF NOT EXISTS route_id TEXT;
ALTER TABLE public.vehicle_fuel_logs ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
ALTER TABLE public.vehicle_fuel_logs ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
-- Precisão do GPS em metros: serve para desconfiar de um ponto impreciso (ex.: sinal fraco dentro de um prédio).
ALTER TABLE public.vehicle_fuel_logs ADD COLUMN IF NOT EXISTS location_accuracy_m NUMERIC;

CREATE INDEX IF NOT EXISTS vehicle_fuel_logs_route_idx ON public.vehicle_fuel_logs (route_id);
