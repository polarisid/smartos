-- Relatório de indicadores (PDF Samsung) importado por IA.
-- Guarda só o snapshot mais recente: a cada novo upload, o app apaga a
-- linha anterior e insere a nova (o PDF já traz o histórico do ano inteiro
-- + últimas semanas, então não precisamos acumular uploads).
CREATE TABLE IF NOT EXISTS public.indicator_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT,
    partner_name TEXT,
    location TEXT,
    metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.indicator_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for indicator_reports" ON public.indicator_reports;
CREATE POLICY "Enable all for indicator_reports" ON public.indicator_reports
    FOR ALL USING (true) WITH CHECK (true);

-- Curadoria: quais indicadores extraídos do PDF o admin escolheu acompanhar
-- nos gráficos de evolução (metric_key é estável entre uploads, ex: "ftc__ftc-so").
CREATE TABLE IF NOT EXISTS public.indicator_tracked_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_key TEXT NOT NULL UNIQUE,
    metric_name TEXT,
    metric_section TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.indicator_tracked_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for indicator_tracked_metrics" ON public.indicator_tracked_metrics;
CREATE POLICY "Enable all for indicator_tracked_metrics" ON public.indicator_tracked_metrics
    FOR ALL USING (true) WITH CHECK (true);
