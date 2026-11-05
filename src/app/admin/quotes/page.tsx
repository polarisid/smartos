"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, FileDown, Link2, Loader2, Plus, Search, Trash2, Undo2, Wallet, XCircle, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  PAYMENT_METHODS, PAYMENT_STATE_LABEL, QUOTE_STATUS_LABEL, addPayment, balanceOf, canChangeStatusTo, canReceivePayment,
  cleanText, paidOf, paidPercent, parseMoney, paymentStateOf, removePayment, roundMoney, type QuoteStatus,
} from "@/lib/quotes";
import { configService } from "@/services/supabase/configService";
import { quoteService, type Quote } from "@/services/supabase/quoteService";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const todayKey = () => format(new Date(), "yyyy-MM-dd");

type Filter = "all" | QuoteStatus | "saldo";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "pendente", label: "Pendentes" },
  { key: "aprovado", label: "Aprovados" },
  { key: "saldo", label: "Com saldo a receber" },
  { key: "reprovado", label: "Reprovados" },
];

const statusBadgeClass = (s: QuoteStatus) =>
  s === "aprovado" ? "bg-green-600/15 text-green-700 hover:bg-green-600/15 dark:text-green-400"
  : s === "reprovado" ? "bg-red-600/15 text-red-700 hover:bg-red-600/15 dark:text-red-400"
  : "bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400";

export default function QuotesPage() {
  const { activeUnidadeId, appUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quotes = [], isLoading, error } = useQuery({
    queryKey: ["quotes", activeUnidadeId, appUser?.uid],
    queryFn: () => quoteService.getAll(activeUnidadeId),
  });

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [payingId, setPayingId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["quotes"] });
  const paying = quotes.find(q => q.id === payingId) || null;
  const linking = quotes.find(q => q.id === linkingId) || null;
  const rejecting = quotes.find(q => q.id === rejectingId) || null;
  const deleting = quotes.find(q => q.id === deletingId) || null;

  const summary = useMemo(() => {
    const approved = quotes.filter(q => q.status === "aprovado");
    const approvedTotal = roundMoney(approved.reduce((s, q) => s + q.totalAmount, 0));
    const received = roundMoney(approved.reduce((s, q) => s + paidOf(q.payments), 0));
    return {
      pending: quotes.filter(q => q.status === "pendente").length,
      pendingValue: roundMoney(quotes.filter(q => q.status === "pendente").reduce((s, q) => s + q.totalAmount, 0)),
      approved: approved.length,
      approvedTotal,
      received,
      toReceive: roundMoney(Math.max(0, approvedTotal - received)),
      rejected: quotes.filter(q => q.status === "reprovado").length,
    };
  }, [quotes]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes.filter(q => {
      if (filter === "saldo") { if (q.status !== "aprovado" || balanceOf(q.totalAmount, q.payments) <= 0) return false; }
      else if (filter !== "all" && q.status !== filter) return false;
      if (!term) return true;
      return [q.clientName, q.clientCpf, q.osNumber, q.clientNumber].some(v => (v || "").toLowerCase().includes(term));
    });
  }, [quotes, filter, search]);

  const run = async (id: string, action: () => Promise<void>, okTitle?: string) => {
    setBusyId(id);
    try {
      await action();
      await refresh();
      if (okTitle) toast({ title: okTitle });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Não foi possível salvar", description: e?.message || "Tente de novo." });
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = (q: Quote, status: QuoteStatus, reason?: string) => {
    const check = canChangeStatusTo(q.status, status, q.payments);
    if (!check.ok) { toast({ variant: "destructive", title: "Não dá para mudar a situação", description: check.error }); return; }
    return run(q.id, () => quoteService.setStatus(q.id, status, appUser?.name, reason),
      status === "aprovado" ? "Orçamento aprovado" : status === "reprovado" ? "Orçamento reprovado" : "Orçamento voltou para pendente");
  };

  const downloadPdf = async (q: Quote) => {
    setBusyId(q.id);
    try {
      const [repairCenter, { buildAndDownloadQuotePdf }] = await Promise.all([
        configService.getRepairCenter(activeUnidadeId),
        import("@/lib/quotePdf"),
      ]);
      await buildAndDownloadQuotePdf({
        repairCenter,
        osNumber: q.osNumber,
        clientNumber: q.clientNumber,
        clientName: q.clientName,
        clientCpf: q.clientCpf || "",
        ...q.snapshot,
        items: q.snapshot.items || [],
        discount: q.snapshot.discount || 0,
      });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao gerar o PDF", description: e?.message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Wallet className="h-6 w-6" /> Orçamentos</h2>
          <p className="text-sm text-muted-foreground">
            Orçamentos gerados na Calculadora de Custo. Marque aprovado ou reprovado, vincule à OS e controle o que já foi pago e o que falta pagar.
          </p>
        </div>
        <Button className="gap-1.5" onClick={() => setQuickOpen(true)}><Zap className="h-4 w-4" /> Lançamento rápido</Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {[
          { label: "Pendentes", value: String(summary.pending), hint: brl(summary.pendingValue) },
          { label: "Aprovados", value: String(summary.approved), hint: brl(summary.approvedTotal) },
          { label: "Recebido", value: brl(summary.received), hint: "dos aprovados", tone: "text-green-700 dark:text-green-400" },
          { label: "A receber", value: brl(summary.toReceive), hint: "dos aprovados", tone: summary.toReceive > 0 ? "text-orange-700 dark:text-orange-400" : undefined },
          { label: "Reprovados", value: String(summary.rejected), hint: "" },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
              <p className={`text-lg font-bold tabular-nums ${c.tone || ""}`}>{c.value}</p>
              {c.hint && <p className="text-[11px] text-muted-foreground">{c.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(f => (
              <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>{f.label}</Button>
            ))}
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Cliente, CPF ou OS" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <CardDescription className="text-xs">{visible.length} de {quotes.length} orçamento(s)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Não foi possível carregar os orçamentos. Confira se a migration 32_quotes.sql foi executada no Supabase.</p>
          ) : visible.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {quotes.length === 0 ? "Nenhum orçamento salvo ainda. Gere um na Calculadora de Custo." : "Nenhum orçamento com esse filtro."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="min-w-[150px]">Pagamento</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map(q => {
                    const paid = paidOf(q.payments);
                    const balance = balanceOf(q.totalAmount, q.payments);
                    const state = paymentStateOf(q.totalAmount, q.payments);
                    const busy = busyId === q.id;
                    return (
                      <TableRow key={q.id}>
                        <TableCell className="whitespace-nowrap text-xs">{format(q.createdAt, "dd/MM/yyyy")}</TableCell>
                        <TableCell>
                          <div className="font-medium">{q.clientName}</div>
                          {q.snapshot.quick && <div className="text-[11px] text-sky-700 dark:text-sky-300">⚡ {q.snapshot.items[0]?.description || "Lançamento rápido"}</div>}
                          {q.clientCpf && <div className="text-[11px] text-muted-foreground">{q.clientCpf}</div>}
                        </TableCell>
                        <TableCell>
                          <button type="button" className="inline-flex items-center gap-1 text-xs hover:underline" onClick={() => setLinkingId(q.id)} title="Vincular a uma OS">
                            {q.osNumber ? <span className="font-mono font-semibold">{q.osNumber}</span> : <span className="text-muted-foreground"><Link2 className="mr-1 inline h-3 w-3" />Vincular</span>}
                          </button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{brl(q.totalAmount)}</TableCell>
                        <TableCell>
                          <Badge className={statusBadgeClass(q.status)}>{QUOTE_STATUS_LABEL[q.status]}</Badge>
                          {q.status === "reprovado" && q.rejectReason && <div className="mt-0.5 max-w-[160px] text-[10px] text-muted-foreground">{q.rejectReason}</div>}
                          {q.decidedAt && <div className="text-[10px] text-muted-foreground">{format(q.decidedAt, "dd/MM")}{q.decidedByName ? ` · ${q.decidedByName}` : ""}</div>}
                        </TableCell>
                        <TableCell>
                          {q.status === "aprovado" ? (
                            <div className="space-y-1">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div className={`h-full ${state === "quitado" ? "bg-green-600" : "bg-orange-500"}`} style={{ width: `${paidPercent(q.totalAmount, q.payments)}%` }} />
                              </div>
                              <div className="flex justify-between text-[11px] tabular-nums">
                                <span className="text-green-700 dark:text-green-400">Pago {brl(paid)}</span>
                                <span className={balance > 0 ? "font-semibold text-orange-700 dark:text-orange-400" : "text-muted-foreground"}>
                                  {balance > 0 ? `Falta ${brl(balance)}` : PAYMENT_STATE_LABEL[state]}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1">
                            {q.status !== "aprovado" && (
                              <Button size="sm" variant="outline" className="gap-1 text-green-700" disabled={busy} onClick={() => setStatus(q, "aprovado")}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar
                              </Button>
                            )}
                            {q.status !== "reprovado" && (
                              <Button size="sm" variant="outline" className="gap-1 text-red-700" disabled={busy} onClick={() => setRejectingId(q.id)}>
                                <XCircle className="h-3.5 w-3.5" /> Reprovar
                              </Button>
                            )}
                            {q.status !== "pendente" && (
                              <Button size="sm" variant="ghost" className="gap-1" disabled={busy} onClick={() => setStatus(q, "pendente")} title="Voltar para pendente">
                                <Undo2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canReceivePayment(q.status) && (
                              <Button size="sm" className="gap-1" onClick={() => setPayingId(q.id)}>
                                <Wallet className="h-3.5 w-3.5" /> Pagamentos
                              </Button>
                            )}
                            {!q.snapshot.quick && (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => downloadPdf(q)} title="Baixar o PDF">
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setDeletingId(q.id)} title="Apagar">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <QuickDialog
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        byName={appUser?.name}
        unidadeId={activeUnidadeId}
        quotes={quotes}
        onSaved={() => { setQuickOpen(false); void refresh(); }}
      />

      <PaymentsDialog
        quote={paying}
        onClose={() => setPayingId(null)}
        byName={appUser?.name}
        onSave={(q, payments, okTitle) => run(q.id, () => quoteService.setPayments(q.id, payments), okTitle)}
      />

      <LinkDialog
        quote={linking}
        onClose={() => setLinkingId(null)}
        onSave={(q, os) => run(q.id, () => quoteService.setOsNumber(q.id, os), os ? "Orçamento vinculado à OS" : "Vínculo com a OS removido").then(() => setLinkingId(null))}
      />

      <RejectDialog
        quote={rejecting}
        onClose={() => setRejectingId(null)}
        onConfirm={(q, reason) => { setRejectingId(null); void setStatus(q, "reprovado", reason); }}
      />

      <Dialog open={!!deleting} onOpenChange={o => !o && setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar orçamento?</DialogTitle>
            <DialogDescription>
              {deleting && `${deleting.clientName} · ${brl(deleting.totalAmount)}`}
              {deleting && paidOf(deleting.payments) > 0 && ` · ATENÇÃO: tem ${brl(paidOf(deleting.payments))} de pagamentos lançados, que serão apagados junto.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { const q = deleting; setDeletingId(null); if (q) void run(q.id, () => quoteService.remove(q.id), "Orçamento apagado"); }}>Apagar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentsDialog({ quote, onClose, byName, onSave }: {
  quote: Quote | null;
  onClose: () => void;
  byName?: string;
  onSave: (q: Quote, payments: Quote["payments"], okTitle: string) => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState<string>("PIX");
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState("");

  if (!quote) return null;
  const balance = balanceOf(quote.totalAmount, quote.payments);

  const add = (amount: number) => {
    const result = addPayment(quote.totalAmount, quote.payments, { amount, method, date, note, byName });
    if (!result.ok) { toast({ variant: "destructive", title: "Pagamento não registrado", description: result.error }); return; }
    void onSave(quote, result.payments, "Pagamento registrado");
    setAmountText("");
    setNote("");
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pagamentos · {quote.clientName}</DialogTitle>
          <DialogDescription>
            {quote.osNumber ? `OS ${quote.osNumber} · ` : ""}Total {brl(quote.totalAmount)} · Pago {brl(paidOf(quote.payments))} · {balance > 0 ? `Falta ${brl(balance)}` : "Quitado"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {quote.payments.length === 0 ? (
            <p className="rounded-lg border p-3 text-center text-xs text-muted-foreground">Nenhum pagamento lançado.</p>
          ) : (
            quote.payments.map(p => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-semibold tabular-nums">{brl(p.amount)}</span>
                  <span className="text-muted-foreground"> · {p.method} · {format(new Date(p.date + "T12:00:00"), "dd/MM/yyyy")}</span>
                  {(p.note || p.byName) && <div className="truncate text-[11px] text-muted-foreground">{[p.note, p.byName && `por ${p.byName}`].filter(Boolean).join(" · ")}</div>}
                </div>
                <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground hover:text-destructive" title="Remover pagamento"
                  onClick={() => void onSave(quote, removePayment(quote.payments, p.id), "Pagamento removido")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        {balance > 0 && (
          <div className="space-y-3 border-t pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Valor recebido (R$)</Label>
                <Input value={amountText} onChange={e => setAmountText(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0,00" inputMode="decimal" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Forma</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={date} max={todayKey()} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Observação</Label>
                <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="gap-1.5" disabled={!amountText} onClick={() => add(parseMoney(amountText))}><Plus className="h-4 w-4" /> Registrar pagamento</Button>
              <Button variant="outline" onClick={() => add(balance)}>Quitar saldo ({brl(balance)})</Button>
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const QUICK_DESCRIPTIONS = ["Taxa de visita", "Sinal / entrada", "Peça", "Mão de obra", "Outro"];

// Lançamento rápido: cobrança avulsa (ex.: taxa de visita) sem montar orçamento. Já nasce aprovada e com o
// que o cliente já pagou lançado (tudo, parte ou nada) - o mesmo controle de pago/falta pagar dos orçamentos.
// Vários lançamentos podem ser da mesma OS (ex.: taxa de visita + peça): o aviso mostra o que a OS já tem.
type PaidMode = "total" | "parcial" | "nenhum";

function QuickDialog({ open, onClose, byName, unidadeId, quotes, onSaved }: {
  open: boolean; onClose: () => void; byName?: string; unidadeId?: string | null; quotes: Quote[]; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [client, setClient] = useState("");
  const [os, setOs] = useState("");
  const [description, setDescription] = useState("Taxa de visita");
  const [amountText, setAmountText] = useState("");
  const [mode, setMode] = useState<PaidMode>("total");
  const [paidText, setPaidText] = useState("");
  const [method, setMethod] = useState<string>("PIX");
  const [date, setDate] = useState(todayKey());
  const [saving, setSaving] = useState(false);
  // Marcado = não soma no registro existente da OS: cria um lançamento separado.
  const [separate, setSeparate] = useState(false);

  const reset = () => { setSeparate(false); setClient(""); setOs(""); setDescription("Taxa de visita"); setAmountText(""); setMode("total"); setPaidText(""); setMethod("PIX"); setDate(todayKey()); };

  const total = parseMoney(amountText);
  const paidNow = mode === "total" ? total : mode === "parcial" ? parseMoney(paidText) : 0;
  const remaining = roundMoney(Math.max(0, total - paidNow));

  // O que a OS informada já tem lançado (aprovado/pendente): evita lançar em duplicidade e ajuda a somar por OS.
  const osKey = cleanText(os);
  const sameOs = osKey ? quotes.filter(q => q.osNumber === osKey && q.status !== "reprovado") : [];
  // Registro da OS onde o novo valor é somado (o aprovado mais recente; a lista vem do mais novo para o mais antigo).
  // Orçamento ainda pendente não recebe: aprove primeiro, ou o lançamento fica separado.
  const target = sameOs.find(q => q.status === "aprovado") || null;
  const merge = !!target && !separate;
  const mergedTotal = target ? roundMoney(target.totalAmount + total) : 0;
  const mergedPaid = target ? roundMoney(paidOf(target.payments) + paidNow) : 0;
  const onOsChange = (value: string) => {
    setOs(value);
    // Se a OS já tem lançamento, aproveita o nome do cliente.
    const known = quotes.find(q => q.osNumber === cleanText(value));
    if (known && !cleanText(client)) setClient(known.clientName);
  };

  const save = async () => {
    if (!osKey) { toast({ variant: "destructive", title: "Informe o número da OS.", description: "O lançamento rápido precisa estar vinculado a uma ordem de serviço." }); return; }
    if (!merge && !cleanText(client)) { toast({ variant: "destructive", title: "Informe o cliente." }); return; }
    if (!(total > 0)) { toast({ variant: "destructive", title: "Informe o valor total maior que zero." }); return; }
    if (mode === "parcial" && !(paidNow > 0)) { toast({ variant: "destructive", title: "Informe quanto já foi recebido." }); return; }
    if (paidNow > total) { toast({ variant: "destructive", title: "O valor recebido passa do total." }); return; }
    const itemDescription = cleanText(description) || "Lançamento rápido";
    // Soma no registro que a OS já tem: total maior, item novo e o pagamento na mesma lista.
    if (merge && target) {
      let payments = target.payments;
      if (paidNow > 0) {
        const result = addPayment(mergedTotal, target.payments, { amount: paidNow, method, date, byName, note: itemDescription });
        if (!result.ok) { toast({ variant: "destructive", title: "Pagamento não registrado", description: result.error }); return; }
        payments = result.payments;
      }
      setSaving(true);
      try {
        await quoteService.update(target.id, {
          total_amount: mergedTotal,
          payments,
          data: { ...target.snapshot, items: [...(target.snapshot.items || []), { description: itemDescription, value: total, quantity: 1, kind: "servico" }] },
        });
        const left = roundMoney(Math.max(0, mergedTotal - mergedPaid));
        toast({ title: `Somado à OS ${osKey}`, description: `Total ${brl(mergedTotal)} · pago ${brl(mergedPaid)} · ${left > 0 ? `falta ${brl(left)}` : "quitado"}` });
        reset();
        onSaved();
      } catch (e: any) {
        console.error(e);
        toast({ variant: "destructive", title: "Não foi possível salvar", description: e?.message || "Tente de novo." });
      } finally {
        setSaving(false);
      }
      return;
    }
    let payments: Quote["payments"] = [];
    if (paidNow > 0) {
      const result = addPayment(total, [], { amount: paidNow, method, date, byName });
      if (!result.ok) { toast({ variant: "destructive", title: "Pagamento não registrado", description: result.error }); return; }
      payments = result.payments;
    }
    setSaving(true);
    try {
      await quoteService.create({
        osNumber: osKey,
        clientName: cleanText(client),
        totalAmount: total,
        createdByName: byName,
        status: "aprovado",
        payments,
        snapshot: { quick: true, discount: 0, items: [{ description: cleanText(description) || "Lançamento rápido", value: total, quantity: 1, kind: "servico" }] },
      }, unidadeId);
      toast({ title: remaining <= 0 ? "Lançado e quitado" : paidNow > 0 ? `Lançado: recebido ${brl(paidNow)}, falta ${brl(remaining)}` : "Cobrança lançada (falta receber tudo)" });
      reset();
      onSaved();
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Não foi possível salvar", description: e?.message || "Tente de novo." });
    } finally {
      setSaving(false);
    }
  };

  const MODES: { key: PaidMode; label: string }[] = [
    { key: "total", label: "Pago total" },
    { key: "parcial", label: "Pagou parte" },
    { key: "nenhum", label: "A pagar" },
  ];

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lançamento rápido</DialogTitle>
          <DialogDescription>Cobrança avulsa, como a taxa de visita, sem montar orçamento. Entra como aprovada e já controla pago e falta pagar. Dá para lançar mais de um para a mesma OS.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Nº da OS *</Label>
            <Input autoFocus value={os} onChange={e => onOsChange(e.target.value)} placeholder="Vincula à OS" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cliente *</Label>
            <Input value={client} onChange={e => setClient(e.target.value)} placeholder="Nome do cliente" />
          </div>
          {target && (
            <div className="col-span-2 space-y-1 rounded bg-sky-50 px-2 py-1.5 text-[11px] leading-snug text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
              <p>
                Esta OS já tem lançamento: total {brl(target.totalAmount)}, pago {brl(paidOf(target.payments))}, falta {brl(balanceOf(target.totalAmount, target.payments))}.
                {merge && total > 0 && <> Com este: <strong>total {brl(mergedTotal)}, pago {brl(mergedPaid)}, falta {brl(roundMoney(Math.max(0, mergedTotal - mergedPaid)))}</strong>.</>}
              </p>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={separate} onChange={e => setSeparate(e.target.checked)} className="h-3.5 w-3.5" />
                Lançar separado (não somar no registro desta OS)
              </label>
            </div>
          )}
          {!target && sameOs.length > 0 && (
            <p className="col-span-2 rounded bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Esta OS tem orçamento pendente (ainda não aprovado). Este lançamento ficará separado.
            </p>
          )}
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Input list="quick-descriptions" value={description} onChange={e => setDescription(e.target.value)} />
            <datalist id="quick-descriptions">{QUICK_DESCRIPTIONS.map(d => <option key={d} value={d} />)}</datalist>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor total (R$) *</Label>
            <Input value={amountText} onChange={e => setAmountText(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0,00" inputMode="decimal" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Recebido agora (R$)</Label>
            <Input
              value={mode === "total" ? (total > 0 ? String(total).replace(".", ",") : "") : mode === "nenhum" ? "0,00" : paidText}
              disabled={mode !== "parcial"}
              onChange={e => setPaidText(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="0,00"
              inputMode="decimal"
            />
          </div>
          <div className="col-span-2 flex gap-1">
            {MODES.map(m => (
              <Button key={m.key} type="button" size="sm" variant={mode === m.key ? "default" : "outline"} className="flex-1" onClick={() => setMode(m.key)}>{m.label}</Button>
            ))}
          </div>
          <div className="col-span-2 flex justify-between rounded bg-muted/50 px-2 py-1.5 text-sm tabular-nums">
            <span>Recebido <strong className="text-green-700 dark:text-green-400">{brl(paidNow)}</strong></span>
            <span>Falta pagar <strong className={remaining > 0 ? "text-orange-700 dark:text-orange-400" : ""}>{brl(remaining)}</strong></span>
          </div>
          {paidNow > 0 && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Forma</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={date} max={todayKey()} onChange={e => setDate(e.target.value)} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={saving || !osKey} className="gap-1.5" onClick={save}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Lançar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({ quote, onClose, onSave }: { quote: Quote | null; onClose: () => void; onSave: (q: Quote, os: string | null) => Promise<void> | void }) {
  const [value, setValue] = useState<string | null>(null);
  if (!quote) return null;
  const text = value ?? quote.osNumber ?? "";
  const close = () => { setValue(null); onClose(); };
  return (
    <Dialog open onOpenChange={o => !o && close()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Vincular a uma OS</DialogTitle>
          <DialogDescription>{quote.clientName} · deixe vazio para tirar o vínculo.</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={text} onChange={e => setValue(e.target.value)} placeholder="Número da OS" onKeyDown={e => { if (e.key === "Enter") { void onSave(quote, cleanText(text) || null); setValue(null); } }} />
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button onClick={() => { void onSave(quote, cleanText(text) || null); setValue(null); }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ quote, onClose, onConfirm }: { quote: Quote | null; onClose: () => void; onConfirm: (q: Quote, reason: string) => void }) {
  const [reason, setReason] = useState("");
  if (!quote) return null;
  const close = () => { setReason(""); onClose(); };
  return (
    <Dialog open onOpenChange={o => !o && close()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reprovar orçamento</DialogTitle>
          <DialogDescription>{quote.clientName} · {brl(quote.totalAmount)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label className="text-xs">Motivo (opcional)</Label>
          <Input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex.: cliente achou caro" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button variant="destructive" onClick={() => { onConfirm(quote, reason); setReason(""); }}>Reprovar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
