-- Técnico passa a ver todos os dados operacionais da PRÓPRIA unidade (como um
-- admin dela), não só os registros vinculados ao seu proprio id - ex: um
-- técnico de São Luís vê todas as rotas de São Luís, não só as suas. Isolamento
-- entre unidades continua intacto (master ve tudo, os demais só a própria
-- unidade). Idempotente: recria as mesmas 6 políticas com a condição
-- simplificada.

DROP POLICY IF EXISTS "unidade + technician isolation" ON public.routes;
CREATE POLICY "unidade isolation" ON public.routes
FOR ALL USING (
    public.user_role() = 'master'
    OR unidade_id = public.user_unidade_id()
);

DROP POLICY IF EXISTS "unidade + technician isolation" ON public.service_orders;
CREATE POLICY "unidade isolation" ON public.service_orders
FOR ALL USING (
    public.user_role() = 'master'
    OR unidade_id = public.user_unidade_id()
);

DROP POLICY IF EXISTS "unidade + technician isolation" ON public.returns;
CREATE POLICY "unidade isolation" ON public.returns
FOR ALL USING (
    public.user_role() = 'master'
    OR unidade_id = public.user_unidade_id()
);

DROP POLICY IF EXISTS "unidade + technician isolation" ON public.chargebacks;
CREATE POLICY "unidade isolation" ON public.chargebacks
FOR ALL USING (
    public.user_role() = 'master'
    OR unidade_id = public.user_unidade_id()
);

DROP POLICY IF EXISTS "unidade + technician isolation" ON public.technical_reports;
CREATE POLICY "unidade isolation" ON public.technical_reports
FOR ALL USING (
    public.user_role() = 'master'
    OR unidade_id = public.user_unidade_id()
);

DROP POLICY IF EXISTS "unidade + self isolation" ON public.technicians;
CREATE POLICY "unidade isolation" ON public.technicians
FOR ALL USING (
    public.user_role() = 'master'
    OR unidade_id = public.user_unidade_id()
);
