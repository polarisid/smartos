-- routes.is_draft e routes.planned_date existiam na producao (usadas pelo
-- recurso de Planejamento/rascunho de rotas) mas nunca foram capturadas numa
-- migracao do repo - descoberto ao comparar o schema antigo com o novo
-- durante a migracao pro Supabase self-hosted.
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS planned_date TIMESTAMPTZ;
