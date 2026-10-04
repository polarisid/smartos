-- Ponto de saída e de chegada opcionais POR ROTA ({ address, lat, lng }).
-- NULL = a rota sai e volta pela base da unidade (configs.base_address).
ALTER TABLE public.routes
    ADD COLUMN IF NOT EXISTS start_point JSONB,
    ADD COLUMN IF NOT EXISTS end_point JSONB;
