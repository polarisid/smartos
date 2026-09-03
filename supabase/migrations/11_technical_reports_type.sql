-- Tipo do relatório fotográfico: "reparo" (padrão, exige fotos de pós-reparo
-- e descrição do reparo) ou "visita" (não exige nenhum dos dois).
ALTER TABLE public.technical_reports
    ADD COLUMN IF NOT EXISTS report_type TEXT NOT NULL DEFAULT 'reparo';
