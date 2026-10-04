-- Controle de edição simultânea das rotas: toda alteração carimba updated_at.
-- O app grava com "só se updated_at ainda for o que eu abri"; se outra pessoa (ou o
-- técnico, no celular) alterou antes, a gravação é recusada e o app avisa em vez de
-- sobrescrever o trabalho dos outros em silêncio.
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS routes_touch_updated_at ON public.routes;
CREATE TRIGGER routes_touch_updated_at
    BEFORE UPDATE ON public.routes
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
