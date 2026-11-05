-- Orçamentos (fora de garantia / visita) gerados no SmartOS: vínculo opcional com a OS, aprovado/reprovado
-- e controle do que já foi pago e do que falta pagar. Só admin e master leem e escrevem.
-- payments: [{ id, amount, method, date (yyyy-MM-dd), note?, byName? }]
-- data: o que foi usado para gerar o PDF (itens, desconto, sintoma, defeito...), para baixar o PDF de novo igual.
CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID REFERENCES public.unidades(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by TEXT DEFAULT auth.uid()::text,
    created_by_name TEXT,
    os_number TEXT,
    client_name TEXT NOT NULL,
    client_cpf TEXT,
    client_number TEXT,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'reprovado')),
    decided_at TIMESTAMP WITH TIME ZONE,
    decided_by_name TEXT,
    reject_reason TEXT,
    payments JSONB NOT NULL DEFAULT '[]'::jsonb,
    data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS quotes_unidade_idx ON public.quotes (unidade_id);
CREATE INDEX IF NOT EXISTS quotes_os_number_idx ON public.quotes (os_number);
CREATE INDEX IF NOT EXISTS quotes_status_idx ON public.quotes (status);

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unidade isolation (admin)" ON public.quotes;
CREATE POLICY "unidade isolation (admin)" ON public.quotes FOR ALL USING (
    public.user_role() = 'master'
    OR (public.user_role() = 'admin' AND unidade_id = public.user_unidade_id())
) WITH CHECK (
    public.user_role() = 'master'
    OR (public.user_role() = 'admin' AND unidade_id = public.user_unidade_id())
);

-- Mesmo padrão das demais tabelas (15_autofill_unidade_id_trigger.sql): a unidade é preenchida no INSERT.
DROP TRIGGER IF EXISTS set_unidade_id ON public.quotes;
CREATE TRIGGER set_unidade_id BEFORE INSERT ON public.quotes
    FOR EACH ROW EXECUTE FUNCTION public.set_unidade_id_on_insert();
