-- Quem criou o relatório (preenchido sozinho pelo banco a partir da sessão).
-- "Meus Relatórios" lista por criador OU técnico responsável: o campo "Técnico
-- Responsável" do formulário é escolhido à mão (pode ficar vazio ou ser o
-- parceiro de rota), então só filtrar por ele escondia relatórios do próprio
-- técnico. Relatórios antigos ficam com NULL (continuam achados pelo técnico).
ALTER TABLE public.technical_reports
    ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT auth.uid();
