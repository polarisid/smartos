-- Rota de ida e volta no mesmo dia: o técnico volta à base todo dia (não dorme fora).
-- Usado pelo modo Planejamento para simular os dias. Nula/false = rota normal (pode dormir fora).
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS daily_return BOOLEAN NOT NULL DEFAULT false;
