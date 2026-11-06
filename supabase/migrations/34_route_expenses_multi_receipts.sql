-- Gastos de rota: mais de um comprovante (foto ou PDF) por gasto.
-- receipt_path continua guardando o primeiro arquivo (gastos antigos seguem valendo);
-- receipt_paths guarda a lista completa quando o gasto tem mais de um arquivo.
ALTER TABLE public.route_expenses ADD COLUMN IF NOT EXISTS receipt_paths TEXT[] NOT NULL DEFAULT '{}';
