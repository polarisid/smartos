-- Multi-unidade: isola dados por unidade de negocio, com 3 niveis de acesso
-- (technician / admin / master), aplicado via RLS no proprio Postgres em vez
-- de checagem manual no app - a chave anon e publica no bundle do navegador,
-- entao o banco tem que ser a fronteira real de seguranca, nao a tela.
--
-- Convencao existente reaproveitada: quando um tecnico tem login vinculado,
-- technicians.id === auth.users.id (mesmo UUID) - ver technicianService.create()
-- e admin/technicians/page.tsx. Isso evita precisar de uma coluna extra de
-- ligacao pra saber "quais linhas sao desse tecnico logado".

-- 1. Unidades ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.unidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

-- 2. profiles: unidade_id + role 'master' ---------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'technician', 'counter_technician', 'master'));

-- 3. unidade_id nas tabelas operacionais -----------------------------------
ALTER TABLE public.technicians ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
ALTER TABLE public.chargebacks ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
ALTER TABLE public.triages ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
ALTER TABLE public.indicators ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
ALTER TABLE public.indicator_reports ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
ALTER TABLE public.indicator_tracked_metrics ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);

-- configs e um caso especial: a chave primaria hoje e so "id" (texto, ex:
-- 'base_address'), que colidiria entre unidades - cada unidade precisa da
-- sua propria linha 'base_address'. Troca pra chave composta (id, unidade_id).
ALTER TABLE public.configs ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id);
ALTER TABLE public.configs DROP CONSTRAINT IF EXISTS configs_pkey;
DROP POLICY IF EXISTS "Enable all for configs" ON public.configs;
-- Linhas antigas sem unidade_id (seed generico, ex: 'webhook' vazio) nao tem
-- dono - seguro remover numa instalacao nova; numa migracao de dados real,
-- isso deve ser preenchido com o UPDATE ... unidade_id da unidade de origem
-- ANTES de rodar esta migracao, nao depois.
DELETE FROM public.configs WHERE unidade_id IS NULL;

-- 4. Funcoes auxiliares (SECURITY DEFINER pra nao recursar nas proprias
--    politicas de profiles ao ler role/unidade do usuario logado) ----------
CREATE OR REPLACE FUNCTION public.user_role() RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE AS
$$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.user_unidade_id() RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE AS
$$ SELECT unidade_id FROM public.profiles WHERE id = auth.uid() $$;

-- 5. RLS ------------------------------------------------------------------

-- profiles: leitura do proprio perfil e liberada pra todo mundo (senao a
-- funcao user_role()/user_unidade_id() nao teria o que ler pro proprio
-- usuario), mas EDITAR role/unidade_id so admin/master - senao um tecnico
-- poderia se auto-promover a master via chamada direta a API.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles: select proprio ou admin/master" ON public.profiles;
CREATE POLICY "profiles: select proprio ou admin/master" ON public.profiles
FOR SELECT USING (
    id = auth.uid()
    OR public.user_role() = 'master'
    OR (public.user_role() = 'admin' AND unidade_id = public.user_unidade_id())
);
DROP POLICY IF EXISTS "profiles: insert so admin/master" ON public.profiles;
CREATE POLICY "profiles: insert so admin/master" ON public.profiles
FOR INSERT WITH CHECK (
    public.user_role() = 'master'
    OR (public.user_role() = 'admin' AND unidade_id = public.user_unidade_id())
);
DROP POLICY IF EXISTS "profiles: update so admin/master" ON public.profiles;
CREATE POLICY "profiles: update so admin/master" ON public.profiles
FOR UPDATE USING (
    public.user_role() = 'master'
    OR (public.user_role() = 'admin' AND unidade_id = public.user_unidade_id())
);
DROP POLICY IF EXISTS "profiles: delete so admin/master" ON public.profiles;
CREATE POLICY "profiles: delete so admin/master" ON public.profiles
FOR DELETE USING (
    public.user_role() = 'master'
    OR (public.user_role() = 'admin' AND unidade_id = public.user_unidade_id())
);

-- unidades: todo autenticado pode listar (a UI precisa disso pro seletor do
-- master e pro cadastro), mas so master pode criar/editar/excluir.
DROP POLICY IF EXISTS "unidades: leitura geral" ON public.unidades;
CREATE POLICY "unidades: leitura geral" ON public.unidades
FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "unidades: escrita so master" ON public.unidades;
CREATE POLICY "unidades: escrita so master" ON public.unidades
FOR INSERT WITH CHECK (public.user_role() = 'master');
DROP POLICY IF EXISTS "unidades: update so master" ON public.unidades;
CREATE POLICY "unidades: update so master" ON public.unidades
FOR UPDATE USING (public.user_role() = 'master');
DROP POLICY IF EXISTS "unidades: delete so master" ON public.unidades;
CREATE POLICY "unidades: delete so master" ON public.unidades
FOR DELETE USING (public.user_role() = 'master');

-- configs: chave composta (id, unidade_id) + policy propria -----------------
ALTER TABLE public.configs DROP CONSTRAINT IF EXISTS configs_pkey;
ALTER TABLE public.configs ADD CONSTRAINT configs_pkey PRIMARY KEY (id, unidade_id);
ALTER TABLE public.configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unidade isolation" ON public.configs;
CREATE POLICY "unidade isolation" ON public.configs
FOR ALL USING (
    public.user_role() = 'master' OR unidade_id = public.user_unidade_id()
);

-- indicator_reports/indicator_tracked_metrics ja tinham uma policy "permitir
-- tudo" das migracoes 10_indicator_reports.sql - precisa cair, senao RLS
-- combina as duas com OU e a antiga libera geral, anulando o isolamento novo.
DROP POLICY IF EXISTS "Enable all for indicator_reports" ON public.indicator_reports;
DROP POLICY IF EXISTS "Enable all for indicator_tracked_metrics" ON public.indicator_tracked_metrics;

-- Template A: isolamento por unidade (sem restricao extra por tecnico) -----
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'drivers', 'checklists', 'indicators',
        'indicator_reports', 'indicator_tracked_metrics', 'triages'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "unidade isolation" ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY "unidade isolation" ON public.%I FOR ALL USING (
                public.user_role() = ''master'' OR unidade_id = public.user_unidade_id()
            )', t
        );
    END LOOP;
END $$;

-- Template B: isolamento por unidade + tecnico so ve o que e dele ----------
-- (technicians usa id = auth.uid(); as demais usam a coluna technician_id).
-- id/technician_id sao TEXT (migracao 01_alter_schema_to_text.sql converteu
-- de UUID pra TEXT pra comportar IDs antigos do Firebase) - por isso o cast
-- ::text em cima de auth.uid() (que retorna uuid).
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unidade + self isolation" ON public.technicians;
CREATE POLICY "unidade + self isolation" ON public.technicians
FOR ALL USING (
    public.user_role() = 'master'
    OR (
        unidade_id = public.user_unidade_id()
        AND (public.user_role() <> 'technician' OR id = auth.uid()::text)
    )
);

-- technical_reports tambem tinha uma policy "permitir tudo" (05_technical_reports.sql).
DROP POLICY IF EXISTS "Enable all for technical_reports" ON public.technical_reports;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'routes', 'service_orders', 'returns', 'chargebacks', 'technical_reports'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "unidade + technician isolation" ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY "unidade + technician isolation" ON public.%I FOR ALL USING (
                public.user_role() = ''master'' OR (
                    unidade_id = public.user_unidade_id()
                    AND (public.user_role() <> ''technician'' OR technician_id = auth.uid()::text)
                )
            )', t
        );
    END LOOP;
END $$;
