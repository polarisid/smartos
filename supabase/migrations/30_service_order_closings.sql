-- Encerramento de ordens: marca as OS que o administrativo já encerrou no sistema da Samsung (aba "Encerramento de Ordens").
-- Uma linha por OS encerrada; desmarcar apaga a linha. Só admin e master leem e escrevem (o técnico não vê essa aba).
-- service_orders.id é TEXT (ver 01_alter_schema_to_text.sql), por isso service_order_id também.
CREATE TABLE IF NOT EXISTS public.service_order_closings (
    service_order_id TEXT PRIMARY KEY REFERENCES public.service_orders(id) ON DELETE CASCADE,
    unidade_id UUID REFERENCES public.unidades(id),
    closed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    closed_by TEXT DEFAULT auth.uid()::text,
    closed_by_name TEXT
);

CREATE INDEX IF NOT EXISTS service_order_closings_unidade_idx ON public.service_order_closings (unidade_id);

ALTER TABLE public.service_order_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unidade isolation (admin)" ON public.service_order_closings;
CREATE POLICY "unidade isolation (admin)" ON public.service_order_closings FOR ALL USING (
    public.user_role() = 'master'
    OR (public.user_role() = 'admin' AND unidade_id = public.user_unidade_id())
) WITH CHECK (
    public.user_role() = 'master'
    OR (public.user_role() = 'admin' AND unidade_id = public.user_unidade_id())
);

-- Mesmo padrão das demais tabelas (15_autofill_unidade_id_trigger.sql): a unidade é preenchida no INSERT.
DROP TRIGGER IF EXISTS set_unidade_id ON public.service_order_closings;
CREATE TRIGGER set_unidade_id BEFORE INSERT ON public.service_order_closings
    FOR EACH ROW EXECUTE FUNCTION public.set_unidade_id_on_insert();
