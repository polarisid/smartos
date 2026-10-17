-- Lançamento de OS desconsiderado na rota: o registro continua (relatórios, produção, histórico),
-- mas não conta como atendimento da parada na rota (progresso, mapa, previsão, uso de peças).
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS ignore_in_route BOOLEAN NOT NULL DEFAULT false;
