-- Acelera ordenação/filtro por data e a query de contagem usada na paginação
-- da listagem de relatórios no admin (volume esperado: ~10-20 relatórios/dia).
CREATE INDEX IF NOT EXISTS idx_technical_reports_created_at
    ON public.technical_reports (created_at DESC);
