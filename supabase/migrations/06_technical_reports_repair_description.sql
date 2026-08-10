-- Campo para o técnico descrever o que foi feito no reparo ou o que foi observado.
ALTER TABLE public.technical_reports ADD COLUMN IF NOT EXISTS repair_description TEXT;
