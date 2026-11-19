-- Lembretes de rota: categoria livre (ex.: Troca RMA, Coleta, Entrega). Nula = sem categoria.
ALTER TABLE public.route_reminders ADD COLUMN IF NOT EXISTS category TEXT;
