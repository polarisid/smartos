"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, History, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appendEditLog, balanceOf, checkQuoteEdit, cleanEditedItems, itemsTotal, paidOf, parseMoney, roundMoney, type EditableQuoteItem } from "@/lib/quotes";
import { cn } from "@/lib/utils";
import type { Quote, QuoteSnapshot } from "@/services/supabase/quoteService";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const moneyText = (n: number) => (n ? String(n).replace(".", ",") : "");

type Draft = { key: string; code: string; description: string; valueText: string; quantityText: string; kind: "peca" | "servico" };

let seq = 0;
const newKey = () => `item-${Date.now()}-${seq++}`;

const toDraft = (i: EditableQuoteItem): Draft => ({
  key: newKey(), code: i.code || "", description: i.description, valueText: moneyText(i.value), quantityText: String(i.quantity || 1), kind: i.kind,
});

const fromDrafts = (drafts: Draft[]): EditableQuoteItem[] =>
  drafts.map(d => ({ code: d.code, description: d.description, value: parseMoney(d.valueText), quantity: parseInt(d.quantityText, 10) || 1, kind: d.kind }));

/**
 * Edita os itens e o desconto de um orçamento já salvo (inclui o lançamento rápido).
 * As regras (mínimo de 1 item, total não abaixo do que já foi pago, confirmação em aprovado) ficam em `checkQuoteEdit`.
 */
export function EditQuoteItemsDialog({ quote, onClose, byName, onSave }: {
  quote: Quote | null;
  onClose: () => void;
  byName?: string;
  onSave: (quote: Quote, snapshot: QuoteSnapshot, total: number) => Promise<void>;
}) {
  if (!quote) return null;
  // key: ao abrir outro orçamento o formulário recomeça com os itens dele
  return <EditForm key={quote.id} quote={quote} onClose={onClose} byName={byName} onSave={onSave} />;
}

function EditForm({ quote, onClose, byName, onSave }: {
  quote: Quote; onClose: () => void; byName?: string; onSave: (quote: Quote, snapshot: QuoteSnapshot, total: number) => Promise<void>;
}) {
  const quick = !!quote.snapshot.quick;
  const [drafts, setDrafts] = useState<Draft[]>(() => (quote.snapshot.items || []).map(toDraft));
  const [discountText, setDiscountText] = useState(() => moneyText(quote.snapshot.discount || 0));
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const items = useMemo(() => fromDrafts(drafts), [drafts]);
  const discount = quick ? 0 : parseMoney(discountText);
  const subtotal = itemsTotal(items, 0);
  const check = checkQuoteEdit({ items, discount, previousTotal: quote.totalAmount, status: quote.status, payments: quote.payments });

  const originalKey = JSON.stringify([cleanEditedItems(quote.snapshot.items || []), roundMoney(quote.snapshot.discount || 0)]);
  const currentKey = JSON.stringify([cleanEditedItems(items), roundMoney(discount)]);
  const dirty = originalKey !== currentKey;

  const paid = paidOf(quote.payments);
  const newTotal = check.ok ? check.total : itemsTotal(items, discount);
  const diff = roundMoney(newTotal - quote.totalAmount);
  const needsConfirm = check.ok && check.needsConfirm && dirty;
  const canSave = check.ok && dirty && !saving && (!needsConfirm || confirmed);

  const update = (key: string, patch: Partial<Draft>) => setDrafts(ds => ds.map(d => (d.key === key ? { ...d, ...patch } : d)));
  const add = () => setDrafts(ds => [...ds, { key: newKey(), code: "", description: "", valueText: "", quantityText: "1", kind: quick ? "servico" : "peca" }]);
  const remove = (key: string) => setDrafts(ds => ds.filter(d => d.key !== key));

  const save = async () => {
    if (!check.ok || !canSave) return;
    setSaving(true);
    try {
      const cleaned = cleanEditedItems(items);
      const snapshot: QuoteSnapshot = {
        ...quote.snapshot,
        items: cleaned,
        discount: roundMoney(discount),
        edits: appendEditLog(quote.snapshot.edits, { at: new Date().toISOString(), byName, previousTotal: roundMoney(quote.totalAmount), newTotal: check.total, status: quote.status }),
      };
      await onSave(quote, snapshot, check.total);
    } finally {
      setSaving(false);
    }
  };

  const history = [...(quote.snapshot.edits || [])].reverse().slice(0, 3);

  return (
    <Dialog open onOpenChange={o => !o && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar itens do orçamento</DialogTitle>
          <DialogDescription>
            {quote.clientName}{quote.osNumber ? ` · OS ${quote.osNumber}` : ""} · total atual {brl(quote.totalAmount)}
            {quote.snapshot.quick ? "" : ". O PDF baixado depois já sai com os itens novos."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {drafts.map((d, idx) => (
            <div key={d.key} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">{idx + 1}</span>
                <Input value={d.description} onChange={e => update(d.key, { description: e.target.value })} placeholder={quick ? "Ex.: taxa de visita" : "Descrição da peça ou do serviço"} aria-label="Descrição" />
                <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-destructive hover:text-destructive" disabled={drafts.length <= 1}
                  title={drafts.length <= 1 ? "O orçamento precisa ter pelo menos 1 item" : "Remover item"} aria-label="Remover item" onClick={() => remove(d.key)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 pl-7 sm:grid-cols-[1fr_5rem_8rem_auto]">
                {!quick ? (
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-[11px] text-muted-foreground">Código da peça</Label>
                    <Input value={d.code} onChange={e => update(d.key, { code: e.target.value })} placeholder="Opcional" />
                  </div>
                ) : <div className="hidden sm:block" />}
                <div>
                  <Label className="text-[11px] text-muted-foreground">Qtd.</Label>
                  <Input value={d.quantityText} inputMode="numeric" onChange={e => update(d.key, { quantityText: e.target.value.replace(/\D/g, "") })} />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Valor unitário</Label>
                  <Input value={d.valueText} inputMode="decimal" placeholder="0,00" onChange={e => update(d.key, { valueText: e.target.value.replace(/[^\d.,]/g, "") })} />
                </div>
                {!quick ? (
                  <div className="col-span-2 sm:col-span-1">
                    <Label className="text-[11px] text-muted-foreground">Tipo</Label>
                    <div className="flex overflow-hidden rounded-md border">
                      {(["peca", "servico"] as const).map(k => (
                        <button key={k} type="button" onClick={() => update(d.key, { kind: k })}
                          className={cn("h-9 flex-1 px-3 text-xs font-medium transition-colors", d.kind === k ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                          {k === "peca" ? "Peça" : "Serviço"}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : <div className="hidden sm:block" />}
              </div>
              <div className="pl-7 text-right text-[11px] tabular-nums text-muted-foreground">
                Subtotal do item: <span className="font-semibold text-foreground">{brl(roundMoney(items[idx].value) * (items[idx].quantity || 1))}</span>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={add}><Plus className="h-4 w-4" /> Adicionar item</Button>
        </div>

        <div className="space-y-1.5 rounded-lg bg-muted/50 p-3 text-sm tabular-nums">
          <div className="flex justify-between"><span className="text-muted-foreground">Soma dos itens</span><span>{brl(subtotal)}</span></div>
          {!quick && (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="edit-discount" className="font-normal text-muted-foreground">Desconto</Label>
              <Input id="edit-discount" className="h-8 w-32 text-right" value={discountText} inputMode="decimal" placeholder="0,00" onChange={e => setDiscountText(e.target.value.replace(/[^\d.,]/g, ""))} />
            </div>
          )}
          <div className="flex justify-between border-t pt-1.5 text-base font-bold"><span>Novo total</span><span>{brl(newTotal)}</span></div>
          {dirty && diff !== 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Antes {brl(quote.totalAmount)}</span>
              <span className={cn("font-semibold", diff > 0 ? "text-orange-700 dark:text-orange-400" : "text-green-700 dark:text-green-400")}>{diff > 0 ? "+" : "−"}{brl(Math.abs(diff))}</span>
            </div>
          )}
          {quote.status === "aprovado" && paid > 0 && check.ok && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Já pago {brl(paid)}</span>
              <span className="font-semibold">Passa a faltar {brl(balanceOf(check.total, quote.payments))}</span>
            </div>
          )}
        </div>

        {!check.ok && (
          <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {check.error}
          </p>
        )}

        {check.ok && dirty && check.warnings.length > 0 && (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200">
            {check.warnings.map(w => <p key={w} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}</p>)}
            {needsConfirm && (
              <label className="flex cursor-pointer items-center gap-2 font-medium">
                <input type="checkbox" className="h-4 w-4" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
                Confirmo a alteração do valor deste orçamento aprovado
              </label>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="space-y-1 text-[11px] text-muted-foreground">
            <p className="flex items-center gap-1 font-semibold uppercase tracking-wide"><History className="h-3 w-3" /> Alterações anteriores</p>
            {history.map(h => (
              <p key={h.at} className="tabular-nums">
                {format(new Date(h.at), "dd/MM/yyyy HH:mm")}{h.byName ? ` · ${h.byName}` : ""} · {brl(h.previousTotal)} → {brl(h.newTotal)}
              </p>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button disabled={!canSave} className="gap-1.5" onClick={() => void save()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
