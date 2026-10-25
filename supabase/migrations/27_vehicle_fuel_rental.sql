-- Controle de veículos, fase 2: abastecimentos (cartão corporativo) e veículos locados.
--  * vehicles ganha propriedade (própria da loja ou locada) e os dados do contrato de locação:
--    locadora, hodômetro na retirada, franquia de km do contrato e data de devolução.
--  * vehicle_fuel_logs: um registro por abastecimento. O consumo real (km/l) é calculado no app
--    entre dois abastecimentos de tanque cheio, a partir do hodômetro de cada um.

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'propria';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS rental_company TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS rental_start_odometer_km INTEGER CHECK (rental_start_odometer_km IS NULL OR rental_start_odometer_km >= 0);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS rental_km_limit INTEGER CHECK (rental_km_limit IS NULL OR rental_km_limit > 0);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS rental_end_date DATE;
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_ownership_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_ownership_check CHECK (ownership IN ('propria', 'locada'));

CREATE TABLE IF NOT EXISTS public.vehicle_fuel_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID REFERENCES public.unidades(id),
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    driver_id TEXT,
    fuel_date DATE NOT NULL DEFAULT current_date,
    odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
    liters NUMERIC NOT NULL CHECK (liters > 0),
    total_value NUMERIC NOT NULL CHECK (total_value > 0),
    fuel_type TEXT,                          -- combustível abastecido (flex pode alternar)
    full_tank BOOLEAN NOT NULL DEFAULT true, -- tanque cheio: base do cálculo de consumo
    station TEXT,
    card_last4 TEXT,                         -- final do cartão corporativo, para conferir com a fatura
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS vehicle_fuel_logs_vehicle_date_idx ON public.vehicle_fuel_logs (vehicle_id, fuel_date DESC);

-- Mesmo padrão de 26_vehicles_km.sql: unidade preenchida no INSERT e isolamento por unidade.
ALTER TABLE public.vehicle_fuel_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unidade isolation" ON public.vehicle_fuel_logs;
CREATE POLICY "unidade isolation" ON public.vehicle_fuel_logs FOR ALL USING (
    public.user_role() = 'master' OR unidade_id = public.user_unidade_id()
) WITH CHECK (
    public.user_role() = 'master' OR unidade_id = public.user_unidade_id()
);
DROP TRIGGER IF EXISTS set_unidade_id ON public.vehicle_fuel_logs;
CREATE TRIGGER set_unidade_id BEFORE INSERT ON public.vehicle_fuel_logs
    FOR EACH ROW EXECUTE FUNCTION public.set_unidade_id_on_insert();

-- O hodômetro do abastecimento também faz o hodômetro atual do veículo avançar (só avança).
CREATE OR REPLACE FUNCTION public.sync_vehicle_odometer_from_fuel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.vehicles
       SET current_odometer_km = GREATEST(COALESCE(current_odometer_km, 0), NEW.odometer_km)
     WHERE id = NEW.vehicle_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_vehicle_odometer_from_fuel ON public.vehicle_fuel_logs;
CREATE TRIGGER sync_vehicle_odometer_from_fuel
    AFTER INSERT OR UPDATE OF odometer_km ON public.vehicle_fuel_logs
    FOR EACH ROW EXECUTE FUNCTION public.sync_vehicle_odometer_from_fuel();
