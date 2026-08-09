-- Relatório técnico fotográfico por OS (Produto: Frontal/Traseira/Serial, Defeito, Pós-Reparo)

CREATE TABLE IF NOT EXISTS public.technical_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_order_number TEXT NOT NULL,
    technician_id TEXT,
    technician_name TEXT,
    consumer_name TEXT,
    product_model TEXT,
    serial_number TEXT,
    photos JSONB DEFAULT '[]'::jsonb,
    observations TEXT,
    responsible_name TEXT,
    responsible_signature TEXT,
    ai_score NUMERIC,
    ai_score_feedback TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_technical_reports_service_order_number
    ON public.technical_reports (service_order_number);

-- Idempotente: adiciona as colunas caso a tabela já exista de uma versão anterior desta migração.
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS ai_score NUMERIC;
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS ai_score_feedback TEXT;

ALTER TABLE public.technical_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for technical_reports" ON public.technical_reports;
CREATE POLICY "Enable all for technical_reports" ON public.technical_reports
    FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket para as fotos do relatório
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-photos', 'report-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read for report-photos" ON storage.objects;
CREATE POLICY "Public read for report-photos" ON storage.objects
    FOR SELECT USING (bucket_id = 'report-photos');

DROP POLICY IF EXISTS "Anon insert for report-photos" ON storage.objects;
CREATE POLICY "Anon insert for report-photos" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'report-photos');

DROP POLICY IF EXISTS "Anon update for report-photos" ON storage.objects;
CREATE POLICY "Anon update for report-photos" ON storage.objects
    FOR UPDATE USING (bucket_id = 'report-photos');

DROP POLICY IF EXISTS "Anon delete for report-photos" ON storage.objects;
CREATE POLICY "Anon delete for report-photos" ON storage.objects
    FOR DELETE USING (bucket_id = 'report-photos');
