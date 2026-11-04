import { supabase } from "@/lib/supabase";
import type { QuoteItem } from "@/lib/quotePdf";
import type { QuotePayment, QuoteStatus } from "@/lib/quotes";

/** Tudo que o PDF do orçamento usa (menos o centro de reparo, que vem das configurações da unidade). */
export type QuoteSnapshot = {
  symptom?: string;
  accessory?: string;
  defectFound?: string;
  serviceDescription?: string;
  observations?: string;
  completionTime?: string;
  items: QuoteItem[];
  discount: number;
};

export type Quote = {
  id: string;
  createdAt: Date;
  createdByName?: string;
  osNumber?: string;
  clientName: string;
  clientCpf?: string;
  clientNumber?: string;
  totalAmount: number;
  status: QuoteStatus;
  decidedAt?: Date;
  decidedByName?: string;
  rejectReason?: string;
  payments: QuotePayment[];
  snapshot: QuoteSnapshot;
};

export type NewQuote = {
  osNumber?: string;
  clientName: string;
  clientCpf?: string;
  clientNumber?: string;
  totalAmount: number;
  snapshot: QuoteSnapshot;
  createdByName?: string;
};

const fromRow = (r: any): Quote => ({
  id: r.id,
  createdAt: new Date(r.created_at),
  createdByName: r.created_by_name ?? undefined,
  osNumber: r.os_number ?? undefined,
  clientName: r.client_name,
  clientCpf: r.client_cpf ?? undefined,
  clientNumber: r.client_number ?? undefined,
  totalAmount: Number(r.total_amount) || 0,
  status: (r.status as QuoteStatus) || "pendente",
  decidedAt: r.decided_at ? new Date(r.decided_at) : undefined,
  decidedByName: r.decided_by_name ?? undefined,
  rejectReason: r.reject_reason ?? undefined,
  payments: Array.isArray(r.payments) ? r.payments : [],
  snapshot: { items: [], discount: 0, ...(r.data || {}) },
});

export const quoteService = {
  async getAll(unidadeId?: string | null): Promise<Quote[]> {
    let query = supabase.from("quotes").select("*").order("created_at", { ascending: false });
    if (unidadeId) query = query.eq("unidade_id", unidadeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(fromRow);
  },

  // unidadeId: obrigatório na prática pro master (o gatilho do banco só preenche a unidade de quem não é master).
  async create(input: NewQuote, unidadeId?: string | null): Promise<Quote> {
    const { data, error } = await supabase
      .from("quotes")
      .insert({
        os_number: input.osNumber?.trim() || null,
        client_name: input.clientName,
        client_cpf: input.clientCpf || null,
        client_number: input.clientNumber || null,
        total_amount: input.totalAmount,
        created_by_name: input.createdByName || null,
        data: input.snapshot,
        ...(unidadeId ? { unidade_id: unidadeId } : {}),
      } as any)
      .select("*")
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async setOsNumber(id: string, osNumber: string | null): Promise<void> {
    await this.update(id, { os_number: osNumber?.trim() || null });
  },

  async setStatus(id: string, status: QuoteStatus, decidedByName?: string, rejectReason?: string): Promise<void> {
    await this.update(id, {
      status,
      decided_at: status === "pendente" ? null : new Date().toISOString(),
      decided_by_name: status === "pendente" ? null : decidedByName || null,
      reject_reason: status === "reprovado" ? rejectReason?.trim() || null : null,
    });
  },

  async setPayments(id: string, payments: QuotePayment[]): Promise<void> {
    await this.update(id, { payments });
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await supabase.from("quotes").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("O orçamento não foi apagado (sem permissão ou já removido).");
  },

  // .select('id'): o Supabase devolve sucesso mesmo quando o RLS barra a escrita (0 linhas); aqui isso vira erro.
  async update(id: string, patch: Record<string, unknown>): Promise<void> {
    const { data, error } = await supabase.from("quotes").update(patch as any).eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("A alteração não foi salva (sem permissão ou orçamento removido).");
  },
};
