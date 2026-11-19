-- Lembretes de OS críticas na tela de Rotas (ex.: a Samsung pediu para coletar um produto até 27/11).
-- A tela cruza a OS com as rotas e os atendimentos para mostrar se já entrou em rota e se já foi atendida.
-- Só admin e master leem e escrevem.
CREATE TABLE IF NOT EXISTS public.route_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID REFERENCES public.unidades(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by_name TEXT,
    title TEXT NOT NULL,
    os_number TEXT,
    client_name TEXT,
    city TEXT,
    notes TEXT,
    due_date DATE,
    done_at TIMESTAMP WITH TIME ZONE,
    done_by_name TEXT
);

CREATE INDEX IF NOT EXISTS route_reminders_unidade_idx ON public.route_reminders (unidade_id);
CREATE INDEX IF NOT EXISTS route_reminders_os_number_idx ON public.route_reminders (os_number);

ALTER TABLE public.route_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unidade isolation (admin)" ON public.route_reminders;
CREATE POLICY "unidade isolation (admin)" ON public.route_reminders FOR ALL USING (
    public.user_role() = 'master'
    OR (public.user_role() = 'admin' AND unidade_id = public.user_unidade_id())
) WITH CHECK (
    public.user_role() = 'master'
    OR (public.user_role() = 'admin' AND unidade_id = public.user_unidade_id())
);

-- Mesmo padrão das demais tabelas (15_autofill_unidade_id_trigger.sql): a unidade é preenchida no INSERT.
DROP TRIGGER IF EXISTS set_unidade_id ON public.route_reminders;
CREATE TRIGGER set_unidade_id BEFORE INSERT ON public.route_reminders
    FOR EACH ROW EXECUTE FUNCTION public.set_unidade_id_on_insert();
