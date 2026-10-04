-- Hora de saída do 1º dia da rota ("HH:mm"), usada pelo modo Planejamento.
-- Nula = a simulação começa no início do expediente configurado.
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS departure_time TEXT;
