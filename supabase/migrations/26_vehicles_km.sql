-- Controle de veículos e de km rodado (fase 1).
--  * vehicles: cadastro do veículo da unidade (placa, modelo, combustível, consumo de referência, hodômetro atual).
--  * vehicle_km_logs: um registro por uso do veículo, com hodômetro de saída e de chegada. O km rodado é
--    odometer_end - odometer_start. Pode estar ligado a uma rota (route_id) e a um motorista (driver_id),
--    o que permite comparar o km real com o km planejado da rota.
-- id de rota e de motorista são TEXT (ver 01_alter_schema_to_text.sql), por isso route_id/driver_id também.

CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID REFERENCES public.unidades(id),
    plate TEXT NOT NULL,
    model TEXT,
    fuel_type TEXT,                        -- 'gasolina' | 'etanol' | 'flex' | 'diesel' | 'gnv' | 'eletrico'
    avg_kml NUMERIC CHECK (avg_kml IS NULL OR avg_kml > 0),   -- consumo de referência (km por litro)
    current_odometer_km INTEGER CHECK (current_odometer_km IS NULL OR current_odometer_km >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Placa única por unidade, sem diferenciar maiúscula/minúscula nem hífen/espaço.
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_unidade_plate_uniq
    ON public.vehicles (unidade_id, upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g')));

CREATE TABLE IF NOT EXISTS public.vehicle_km_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID REFERENCES public.unidades(id),
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    route_id TEXT,
    driver_id TEXT,
    log_date DATE NOT NULL DEFAULT current_date,
    odometer_start INTEGER NOT NULL CHECK (odometer_start >= 0),
    odometer_end INTEGER,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT vehicle_km_logs_end_after_start CHECK (odometer_end IS NULL OR odometer_end >= odometer_start)
);

CREATE INDEX IF NOT EXISTS vehicle_km_logs_vehicle_date_idx ON public.vehicle_km_logs (vehicle_id, log_date DESC);
CREATE INDEX IF NOT EXISTS vehicle_km_logs_route_idx ON public.vehicle_km_logs (route_id);

-- Mesmo padrão das demais tabelas (12_multi_unidade.sql e 15_autofill_unidade_id_trigger.sql):
-- unidade preenchida sozinha no INSERT e isolamento por unidade (master vê todas).
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['vehicles', 'vehicle_km_logs'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "unidade isolation" ON public.%I', t);
        EXECUTE format(
            'CREATE POLICY "unidade isolation" ON public.%I FOR ALL USING (
                public.user_role() = ''master'' OR unidade_id = public.user_unidade_id()
            ) WITH CHECK (
                public.user_role() = ''master'' OR unidade_id = public.user_unidade_id()
            )', t
        );
        EXECUTE format('DROP TRIGGER IF EXISTS set_unidade_id ON public.%I', t);
        EXECUTE format(
            'CREATE TRIGGER set_unidade_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_unidade_id_on_insert()',
            t
        );
    END LOOP;
END $$;

-- Ao fechar um registro (odometer_end preenchido), o hodômetro atual do veículo acompanha - só avança.
CREATE OR REPLACE FUNCTION public.sync_vehicle_odometer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.odometer_end IS NOT NULL THEN
        UPDATE public.vehicles
           SET current_odometer_km = GREATEST(COALESCE(current_odometer_km, 0), NEW.odometer_end)
         WHERE id = NEW.vehicle_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_vehicle_odometer ON public.vehicle_km_logs;
CREATE TRIGGER sync_vehicle_odometer
    AFTER INSERT OR UPDATE OF odometer_end ON public.vehicle_km_logs
    FOR EACH ROW EXECUTE FUNCTION public.sync_vehicle_odometer();
