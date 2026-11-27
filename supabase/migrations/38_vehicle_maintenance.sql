-- Manutenção de veículos: histórico de serviços (preventivos e corretivos, com custo de peças e mão de obra)
-- e plano de manutenção preventiva (a cada X km e/ou Y meses). Só admin e master leem e escrevem.
--  * vehicle_maintenance_plans: um item do plano por veículo (ex.: troca de óleo a cada 10.000 km ou 6 meses).
--    baseline_* é a última vez feita antes de usar o sistema (ponto de partida do prazo).
--  * vehicle_maintenances: um registro por serviço feito. plan_id liga o serviço ao item do plano que ele cumpre
--    (a próxima troca é contada a partir dele).

CREATE TABLE IF NOT EXISTS public.vehicle_maintenance_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID REFERENCES public.unidades(id),
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    interval_km INTEGER CHECK (interval_km IS NULL OR interval_km > 0),
    interval_months INTEGER CHECK (interval_months IS NULL OR interval_months > 0),
    baseline_odometer_km INTEGER CHECK (baseline_odometer_km IS NULL OR baseline_odometer_km >= 0),
    baseline_date DATE,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT vehicle_maintenance_plans_interval CHECK (interval_km IS NOT NULL OR interval_months IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS vehicle_maintenance_plans_vehicle_idx ON public.vehicle_maintenance_plans (vehicle_id);

CREATE TABLE IF NOT EXISTS public.vehicle_maintenances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID REFERENCES public.unidades(id),
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.vehicle_maintenance_plans(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('preventiva', 'corretiva')),
    category TEXT,
    description TEXT NOT NULL,
    service_date DATE NOT NULL DEFAULT current_date,
    odometer_km INTEGER CHECK (odometer_km IS NULL OR odometer_km >= 0),
    parts_cost NUMERIC NOT NULL DEFAULT 0 CHECK (parts_cost >= 0),
    labor_cost NUMERIC NOT NULL DEFAULT 0 CHECK (labor_cost >= 0),
    supplier TEXT,
    invoice_number TEXT,
    notes TEXT,
    created_by_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS vehicle_maintenances_vehicle_date_idx ON public.vehicle_maintenances (vehicle_id, service_date DESC);
CREATE INDEX IF NOT EXISTS vehicle_maintenances_plan_idx ON public.vehicle_maintenances (plan_id);

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['vehicle_maintenance_plans', 'vehicle_maintenances'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "unidade isolation (admin)" ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY "unidade isolation (admin)" ON public.%I FOR ALL USING (
                public.user_role() = ''master''
                OR (public.user_role() = ''admin'' AND unidade_id = public.user_unidade_id())
            ) WITH CHECK (
                public.user_role() = ''master''
                OR (public.user_role() = ''admin'' AND unidade_id = public.user_unidade_id())
            )', t
        );
        EXECUTE format('DROP TRIGGER IF EXISTS set_unidade_id ON public.%I', t);
        EXECUTE format(
            'CREATE TRIGGER set_unidade_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_unidade_id_on_insert()',
            t
        );
    END LOOP;
END $$;

-- O hodômetro informado no serviço também faz o hodômetro atual do veículo avançar (só avança), como no abastecimento.
CREATE OR REPLACE FUNCTION public.sync_vehicle_odometer_from_maintenance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.odometer_km IS NOT NULL THEN
        UPDATE public.vehicles
           SET current_odometer_km = GREATEST(COALESCE(current_odometer_km, 0), NEW.odometer_km)
         WHERE id = NEW.vehicle_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_vehicle_odometer_from_maintenance ON public.vehicle_maintenances;
CREATE TRIGGER sync_vehicle_odometer_from_maintenance
    AFTER INSERT OR UPDATE OF odometer_km ON public.vehicle_maintenances
    FOR EACH ROW EXECUTE FUNCTION public.sync_vehicle_odometer_from_maintenance();
