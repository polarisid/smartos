-- Vincula opcionalmente um template de checklist ao relatório fotográfico,
-- para ser preenchido e mesclado ao PDF do relatório no momento do download.
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS checklist_template_id TEXT;
