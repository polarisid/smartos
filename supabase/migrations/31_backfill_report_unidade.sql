-- Relatórios técnicos criados por master antes de a unidade ser gravada ficaram com unidade_id NULL:
-- a RLS os esconde de admins/técnicos da unidade e a tela de Encerramento não achava as fotos deles.
-- Este script devolve a unidade a partir do técnico responsável (ou de quem criou o relatório).
-- Só mexe em linhas SEM unidade; relatórios que não tiverem técnico conhecido continuam como estão.

-- 1) Conferir antes (quantos estão sem unidade):
-- SELECT count(*) FROM public.technical_reports WHERE unidade_id IS NULL;

UPDATE public.technical_reports r
SET unidade_id = t.unidade_id
FROM public.technicians t
WHERE r.unidade_id IS NULL
  AND t.unidade_id IS NOT NULL
  AND (r.technician_id = t.id::text OR r.created_by = t.id);

-- 2) Conferir depois (o que sobrou sem unidade precisa ser acertado à mão):
-- SELECT id, service_order_number, technician_name, created_at FROM public.technical_reports WHERE unidade_id IS NULL ORDER BY created_at DESC;
