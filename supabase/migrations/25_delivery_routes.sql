-- Rota de entrega ("rota mãe"): serve só para controlar o envio das peças e das ordens de serviço.
-- Dela saem rotas filhas por dia (parent_route_id), com as OS que ainda não foram finalizadas.
-- kind = 'normal' (padrão) | 'delivery'. A rota de entrega nunca aparece para os técnicos.
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS parent_route_id TEXT;
CREATE INDEX IF NOT EXISTS routes_parent_route_idx ON public.routes (parent_route_id);
