-- Gastos de rota: marca de comprovante "Usado" (já aproveitado, ex.: no reembolso/prestação de contas).
-- receipt_used_at guarda quando foi marcado (nulo = ainda não usado); receipt_used_by_name, quem marcou.
ALTER TABLE public.route_expenses ADD COLUMN IF NOT EXISTS receipt_used_at TIMESTAMPTZ;
ALTER TABLE public.route_expenses ADD COLUMN IF NOT EXISTS receipt_used_by_name TEXT;
