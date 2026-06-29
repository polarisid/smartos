-- Ajustando as chaves primárias e estrangeiras de UUID para TEXT para comportar os IDs antigos do Firebase

-- Primeiro precisamos remover as dependências (chaves estrangeiras)
ALTER TABLE public.service_orders DROP CONSTRAINT IF EXISTS service_orders_technician_id_fkey;
ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_technician_id_fkey;
ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_driver_id_fkey;
ALTER TABLE public.returns DROP CONSTRAINT IF EXISTS returns_technician_id_fkey;
ALTER TABLE public.chargebacks DROP CONSTRAINT IF EXISTS chargebacks_technician_id_fkey;

-- Alterando as chaves primárias de UUID para TEXT
ALTER TABLE public.drivers ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.technicians ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.service_orders ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.routes ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.checklists ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.returns ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.chargebacks ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.indicators ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.presets ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.codes ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.triages ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.knowledge_base_rules ALTER COLUMN id TYPE TEXT;

-- Alterando as chaves estrangeiras de UUID para TEXT
ALTER TABLE public.service_orders ALTER COLUMN technician_id TYPE TEXT;
ALTER TABLE public.routes ALTER COLUMN technician_id TYPE TEXT;
ALTER TABLE public.routes ALTER COLUMN driver_id TYPE TEXT;
ALTER TABLE public.returns ALTER COLUMN technician_id TYPE TEXT;
ALTER TABLE public.chargebacks ALTER COLUMN technician_id TYPE TEXT;

-- Limpando referências órfãs antes de criar as chaves estrangeiras
UPDATE public.service_orders SET technician_id = NULL WHERE technician_id IS NOT NULL AND technician_id NOT IN (SELECT id FROM public.technicians);
UPDATE public.routes SET technician_id = NULL WHERE technician_id IS NOT NULL AND technician_id NOT IN (SELECT id FROM public.technicians);
UPDATE public.routes SET driver_id = NULL WHERE driver_id IS NOT NULL AND driver_id NOT IN (SELECT id FROM public.drivers);
UPDATE public.returns SET technician_id = NULL WHERE technician_id IS NOT NULL AND technician_id NOT IN (SELECT id FROM public.technicians);
UPDATE public.chargebacks SET technician_id = NULL WHERE technician_id IS NOT NULL AND technician_id NOT IN (SELECT id FROM public.technicians);

-- Recriando as chaves estrangeiras
ALTER TABLE public.service_orders ADD CONSTRAINT service_orders_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE SET NULL;
ALTER TABLE public.routes ADD CONSTRAINT routes_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE SET NULL;
ALTER TABLE public.routes ADD CONSTRAINT routes_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;
ALTER TABLE public.returns ADD CONSTRAINT returns_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE SET NULL;
ALTER TABLE public.chargebacks ADD CONSTRAINT chargebacks_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.technicians(id) ON DELETE SET NULL;
