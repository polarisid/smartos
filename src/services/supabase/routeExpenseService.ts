import { supabase } from "@/lib/supabase";
import type { RouteExpense } from "@/lib/routeExpenses";

const BUCKET = "route-expense-receipts";

export type NewRouteExpense = {
  routeId: string;
  routeName?: string;
  category: string;
  amount: number;
  date: string;
  description?: string;
  createdByName?: string;
  /** Foto (já comprimida) ou PDF do comprovante. Obrigatório no app: o lançamento sem comprovante não é criado. */
  receipt: File;
};

const fromRow = (r: any): RouteExpense => ({
  id: r.id,
  routeId: r.route_id,
  routeName: r.route_name ?? undefined,
  category: r.category,
  amount: Number(r.amount) || 0,
  date: String(r.expense_date).slice(0, 10),
  description: r.description ?? undefined,
  receiptPath: r.receipt_path ?? undefined,
  createdBy: r.created_by ?? undefined,
  createdByName: r.created_by_name ?? undefined,
  createdAt: new Date(r.created_at),
});

export const MAX_RECEIPT_PDF_BYTES = 10 * 1024 * 1024;

export const isPdfFile = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);
export const isPdfPath = (path?: string | null) => !!path && /\.pdf$/i.test(path);

const extensionOf = (file: File) => {
  if (isPdfFile(file)) return "pdf";
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return file.type === "image/png" ? "png" : "jpg";
};

export const routeExpenseService = {
  // Técnico: a RLS devolve só os dele. Admin: todos da unidade. Master: passe a unidade para filtrar.
  async getAll(unidadeId?: string | null, range?: { from?: string; to?: string }): Promise<RouteExpense[]> {
    let query = supabase.from("route_expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false });
    if (unidadeId) query = query.eq("unidade_id", unidadeId);
    if (range?.from) query = query.gte("expense_date", range.from);
    if (range?.to) query = query.lte("expense_date", range.to);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(fromRow);
  },

  async getByRoute(routeId: string): Promise<RouteExpense[]> {
    const { data, error } = await supabase
      .from("route_expenses").select("*").eq("route_id", routeId)
      .order("expense_date", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(fromRow);
  },

  // Envia a foto primeiro; se salvar o gasto falhar, apaga a foto para não deixar arquivo órfão.
  async create(input: NewRouteExpense, unidadeId?: string | null): Promise<RouteExpense> {
    const path = `${unidadeId || "sem-unidade"}/${input.routeId}/${crypto.randomUUID()}.${extensionOf(input.receipt)}`;
    const { error: upError } = await supabase.storage.from(BUCKET).upload(path, input.receipt, {
      contentType: isPdfFile(input.receipt) ? "application/pdf" : input.receipt.type || "image/jpeg",
      upsert: false,
    });
    if (upError) throw new Error("Não foi possível enviar a foto do comprovante: " + upError.message);
    const { data, error } = await supabase
      .from("route_expenses")
      .insert({
        route_id: input.routeId,
        route_name: input.routeName || null,
        category: input.category,
        amount: input.amount,
        expense_date: input.date,
        description: input.description || null,
        receipt_path: path,
        created_by_name: input.createdByName || null,
        ...(unidadeId ? { unidade_id: unidadeId } : {}),
      } as any)
      .select("*")
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      throw error;
    }
    return fromRow(data);
  },

  // .select('id'): o Supabase devolve sucesso mesmo quando o RLS barra a escrita (0 linhas); aqui isso vira erro.
  async update(id: string, patch: { category?: string; amount?: number; date?: string; description?: string | null }): Promise<void> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.category !== undefined) row.category = patch.category;
    if (patch.amount !== undefined) row.amount = patch.amount;
    if (patch.date !== undefined) row.expense_date = patch.date;
    if (patch.description !== undefined) row.description = patch.description;
    const { data, error } = await supabase.from("route_expenses").update(row as any).eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("A alteração não foi salva (sem permissão ou gasto removido).");
  },

  async remove(expense: Pick<RouteExpense, "id" | "receiptPath">): Promise<void> {
    const { data, error } = await supabase.from("route_expenses").delete().eq("id", expense.id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("O gasto não foi apagado (sem permissão ou já removido).");
    if (expense.receiptPath) await supabase.storage.from(BUCKET).remove([expense.receiptPath]).catch(() => {});
  },

  // Link temporário (1 h) para abrir a foto do comprovante: o bucket é privado.
  async getReceiptUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw error || new Error("Não foi possível abrir o comprovante.");
    return data.signedUrl;
  },
};
