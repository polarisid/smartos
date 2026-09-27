-- Nenhum create()/upsert() do app preenche unidade_id na linha nova (conferido
-- em todos os services/supabase/*.ts). Como a coluna nao tem default e a RLS
-- exige unidade_id = user_unidade_id() pra liberar INSERT, toda criacao nova
-- por admin/tecnico estava (ia ficar, so nao testamos ainda contra producao)
-- falhando com erro de permissao. Trigger preenche sozinho a partir da sessao,
-- sem precisar mudar nenhum service do app.
--
-- Master fica de fora de proposito (nao tem unidade_id propria) - criacao por
-- master "dentro" de uma unidade escolhida no seletor fica pra depois.

CREATE OR REPLACE FUNCTION public.set_unidade_id_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.unidade_id IS NULL AND public.user_role() <> 'master' THEN
    NEW.unidade_id := public.user_unidade_id();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'technicians', 'drivers', 'routes', 'service_orders', 'returns',
    'chargebacks', 'technical_reports', 'triages', 'checklists', 'configs',
    'indicators', 'indicator_reports', 'indicator_tracked_metrics'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_unidade_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_unidade_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_unidade_id_on_insert()',
      t
    );
  END LOOP;
END $$;
