-- Assinatura do cliente, usada para preencher o campo de assinatura do
-- checklist anexado ao PDF do relatório.
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS client_signature TEXT;
