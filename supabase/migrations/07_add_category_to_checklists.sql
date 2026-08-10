-- Categoria livre para agrupar checklists (ex: NDF, VOID, Reparo, ou por produto).
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS category TEXT;
