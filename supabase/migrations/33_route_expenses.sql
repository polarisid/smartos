-- Gastos de rota (alimentação, hospedagem, outros): o técnico lança pelo celular, com a foto do comprovante,
-- e o admin confere, ajusta e totaliza por rota, técnico, categoria e período.
-- route_id é TEXT como em routes.id (ver 01_alter_schema_to_text.sql). route_name guarda o nome da rota na hora do
-- lançamento: o gasto continua legível mesmo se a rota for apagada depois. category guarda o NOME da categoria
-- (configurável pelo admin em configs 'route_expense_categories'), pelo mesmo motivo.
CREATE TABLE IF NOT EXISTS public.route_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID REFERENCES public.unidades(id),
    route_id TEXT NOT NULL,
    route_name TEXT,
    category TEXT NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL DEFAULT current_date,
    description TEXT,
    receipt_path TEXT,
    created_by TEXT DEFAULT auth.uid()::text,
    created_by_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS route_expenses_unidade_date_idx ON public.route_expenses (unidade_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS route_expenses_route_idx ON public.route_expenses (route_id);
CREATE INDEX IF NOT EXISTS route_expenses_created_by_idx ON public.route_expenses (created_by);

ALTER TABLE public.route_expenses ENABLE ROW LEVEL SECURITY;

-- Admin e master veem e mexem em tudo da unidade. O técnico só vê, edita e apaga o que ele mesmo lançou.
DROP POLICY IF EXISTS "route_expenses: leitura" ON public.route_expenses;
CREATE POLICY "route_expenses: leitura" ON public.route_expenses FOR SELECT USING (
    public.user_role() = 'master'
    OR (unidade_id = public.user_unidade_id() AND (public.user_role() = 'admin' OR created_by = auth.uid()::text))
);
DROP POLICY IF EXISTS "route_expenses: insert" ON public.route_expenses;
CREATE POLICY "route_expenses: insert" ON public.route_expenses FOR INSERT WITH CHECK (
    public.user_role() = 'master'
    OR (unidade_id = public.user_unidade_id() AND created_by = auth.uid()::text)
);
DROP POLICY IF EXISTS "route_expenses: update" ON public.route_expenses;
CREATE POLICY "route_expenses: update" ON public.route_expenses FOR UPDATE USING (
    public.user_role() = 'master'
    OR (unidade_id = public.user_unidade_id() AND (public.user_role() = 'admin' OR created_by = auth.uid()::text))
) WITH CHECK (
    public.user_role() = 'master'
    OR (unidade_id = public.user_unidade_id() AND (public.user_role() = 'admin' OR created_by = auth.uid()::text))
);
DROP POLICY IF EXISTS "route_expenses: delete" ON public.route_expenses;
CREATE POLICY "route_expenses: delete" ON public.route_expenses FOR DELETE USING (
    public.user_role() = 'master'
    OR (unidade_id = public.user_unidade_id() AND (public.user_role() = 'admin' OR created_by = auth.uid()::text))
);

-- Mesmo padrão das demais tabelas (15_autofill_unidade_id_trigger.sql): a unidade é preenchida no INSERT.
DROP TRIGGER IF EXISTS set_unidade_id ON public.route_expenses;
CREATE TRIGGER set_unidade_id BEFORE INSERT ON public.route_expenses
    FOR EACH ROW EXECUTE FUNCTION public.set_unidade_id_on_insert();

-- Comprovantes: bucket PRIVADO (nota fiscal tem dado financeiro). O app abre a foto por link assinado e temporário.
-- Os arquivos ficam em "<unidade>/<rota>/<uuid>.jpg". Só quem está logado lê, envia ou apaga.
INSERT INTO storage.buckets (id, name, public)
VALUES ('route-expense-receipts', 'route-expense-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "route-expense-receipts: leitura" ON storage.objects;
CREATE POLICY "route-expense-receipts: leitura" ON storage.objects
    FOR SELECT USING (bucket_id = 'route-expense-receipts' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "route-expense-receipts: envio" ON storage.objects;
CREATE POLICY "route-expense-receipts: envio" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'route-expense-receipts' AND auth.role() = 'authenticated');
DROP POLICY IF EXISTS "route-expense-receipts: apagar" ON storage.objects;
CREATE POLICY "route-expense-receipts: apagar" ON storage.objects
    FOR DELETE USING (bucket_id = 'route-expense-receipts' AND auth.role() = 'authenticated');
