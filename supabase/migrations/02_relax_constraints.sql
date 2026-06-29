-- Como o Firebase não tem chaves estrangeiras rígidas, alguns dados antigos estão apontando
-- para Técnicos que já foram excluídos. 
-- Precisamos remover essa validação rígida temporariamente para permitir a importação dos dados históricos.

ALTER TABLE public.service_orders DROP CONSTRAINT IF EXISTS service_orders_technician_id_fkey;
ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_technician_id_fkey;
ALTER TABLE public.returns DROP CONSTRAINT IF EXISTS returns_technician_id_fkey;
ALTER TABLE public.chargebacks DROP CONSTRAINT IF EXISTS chargebacks_technician_id_fkey;

-- Tem uma rota no Firebase antiga que está sem nome, e o PostgreSQL está bloqueando.
ALTER TABLE public.routes ALTER COLUMN name DROP NOT NULL;
