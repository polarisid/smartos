"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Camera, ImageIcon, Loader2, Plus, Receipt, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { compressImageIfNeeded } from "@/lib/imageCompression";
import { cleanLines, cleanText, parseMoney } from "@/lib/quotes";
import { totalOf, totalsByCategory } from "@/lib/routeExpenses";
import { cn } from "@/lib/utils";
import { configService } from "@/services/supabase/configService";
import { routeExpenseService } from "@/services/supabase/routeExpenseService";
import { ReceiptViewer } from "@/components/routes/ReceiptViewer";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const todayKey = () => format(new Date(), "yyyy-MM-dd");
const dayLabel = (key: string) => key.split("-").reverse().slice(0, 2).join("/");

// Botão "Gastos" do cartão da rota (celular): o técnico lança alimentação, hospedagem etc. com a foto do comprovante.
export function RouteExpensesButton({ route, className }: { route: { id: string; name: string }; className?: string }) {
  const { appUser, activeUnidadeId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const unidadeId = appUser?.unidadeId ?? activeUnidadeId ?? null;

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState("");
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(todayKey());
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewPath, setViewPath] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const expensesKey = ["route-expenses", route.id];
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: expensesKey,
    queryFn: () => routeExpenseService.getByRoute(route.id),
    enabled: open,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["expense-categories", unidadeId],
    queryFn: () => configService.getExpenseCategories(unidadeId),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // Só os gastos que o próprio técnico lançou (a RLS já limita; aqui vale para o admin que abrir a rota no celular).
  const mine = useMemo(() => expenses.filter(e => !appUser?.uid || !e.createdBy || e.createdBy === appUser.uid), [expenses, appUser?.uid]);
  const total = totalOf(mine);
  const byCategory = useMemo(() => totalsByCategory(mine), [mine]);

  useEffect(() => { if (!category && categories.length > 0) setCategory(categories[0]); }, [categories, category]);
  useEffect(() => {
    if (!receipt) { setPreview(null); return; }
    const url = URL.createObjectURL(receipt);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [receipt]);

  const amount = parseMoney(amountText);
  const needsDescription = cleanText(category).toLowerCase() === "outros";

  const reset = () => { setAmountText(""); setDescription(""); setReceipt(null); setDate(todayKey()); };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      const { file: ready, unreadable } = await compressImageIfNeeded(file);
      if (unreadable) {
        toast({ variant: "destructive", title: "Não foi possível ler esta foto", description: "Tire a foto de novo ou escolha outra (fotos HEIC podem não abrir: use JPG)." });
        return;
      }
      setReceipt(ready);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Não foi possível ler esta foto", description: "Tire a foto de novo." });
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    if (!category) { toast({ variant: "destructive", title: "Escolha a categoria." }); return; }
    if (!(amount > 0)) { toast({ variant: "destructive", title: "Informe o valor do gasto." }); return; }
    if (!date || date > todayKey()) { toast({ variant: "destructive", title: "Informe a data do gasto (não pode ser futura)." }); return; }
    if (needsDescription && !cleanText(description)) { toast({ variant: "destructive", title: "Descreva o gasto em \"Outros\"." }); return; }
    if (!receipt) { toast({ variant: "destructive", title: "Anexe a foto do comprovante.", description: "O lançamento só é salvo com a foto da nota ou do recibo." }); return; }
    setSaving(true);
    try {
      await routeExpenseService.create({
        routeId: route.id,
        routeName: route.name,
        category,
        amount,
        date,
        description: cleanLines(description) || undefined,
        createdByName: appUser?.name,
        receipt,
      }, unidadeId);
      await queryClient.invalidateQueries({ queryKey: ["route-expenses"] });
      toast({ title: "Gasto lançado", description: `${category} · ${brl(amount)}` });
      reset();
      setAdding(false);
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Não foi possível lançar o gasto", description: e?.message || "Confira a conexão e tente de novo. A foto não foi perdida: o lançamento continua na tela." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const target = expenses.find(e => e.id === id);
    if (!target) return;
    setDeletingId(id);
    try {
      await routeExpenseService.remove(target);
      await queryClient.invalidateQueries({ queryKey: ["route-expenses"] });
      toast({ title: "Gasto apagado" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Não foi possível apagar", description: e?.message });
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={o => { if (!saving) setOpen(o); }}>
        <DialogTrigger asChild>
          <Button variant="outline" className={cn("h-auto flex-col gap-1 px-1 py-2.5 text-xs font-semibold md:h-10 md:flex-row md:gap-2 md:px-4 md:py-2 md:text-sm", className)}>
            <Receipt className="h-5 w-5 md:h-4 md:w-4" />
            <span>Gastos</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[100dvh] w-[100vw] max-w-none overflow-y-auto rounded-none p-4 md:max-w-lg md:rounded-lg md:p-6">
          <DialogHeader>
            <DialogTitle>Gastos da rota</DialogTitle>
            <DialogDescription>{route.name}. Lance alimentação, hospedagem e outros gastos com a foto do comprovante.</DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total que você lançou</p>
            <p className="text-2xl font-bold tabular-nums">{brl(total)}</p>
            {byCategory.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {byCategory.map(c => (
                  <span key={c.category} className="rounded-full bg-background px-2 py-0.5 text-[11px] tabular-nums ring-1 ring-border">{c.category}: <strong>{brl(c.total)}</strong></span>
                ))}
              </div>
            )}
          </div>

          {!adding ? (
            <Button className="gap-1.5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Lançar gasto</Button>
          ) : (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="space-y-1">
                <Label className="text-xs">Categoria *</Label>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map(c => (
                    <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
                      className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", category === c ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Valor (R$) *</Label>
                  <Input value={amountText} onChange={e => setAmountText(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0,00" inputMode="decimal" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data *</Label>
                  <Input type="date" value={date} max={todayKey()} onChange={e => setDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descrição{needsDescription ? " *" : " (opcional)"}</Label>
                <Textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder={needsDescription ? "O que foi este gasto?" : "Ex.: almoço em Itabaiana"} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Foto do comprovante *</Label>
                {preview ? (
                  <div className="relative w-fit">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Comprovante" className="max-h-40 rounded-md border object-contain" />
                    <button type="button" onClick={() => setReceipt(null)} aria-label="Trocar a foto" className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow ring-1 ring-border"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" className="gap-1.5" disabled={reading} onClick={() => cameraRef.current?.click()}>
                      {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Tirar foto
                    </Button>
                    <Button type="button" variant="outline" className="gap-1.5" disabled={reading} onClick={() => galleryRef.current?.click()}>
                      <ImageIcon className="h-4 w-4" /> Galeria
                    </Button>
                  </div>
                )}
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { void onPickFile(e.target.files?.[0]); e.target.value = ""; }} />
                <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={e => { void onPickFile(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" disabled={saving} onClick={() => { reset(); setAdding(false); }}>Cancelar</Button>
                <Button disabled={saving || reading} className="gap-1.5" onClick={save}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Lançar</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seus lançamentos nesta rota</p>
            {isLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
            ) : mine.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhum gasto lançado ainda.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {mine.map(e => (
                  <li key={e.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{e.category}</span>
                        <span className="shrink-0 text-sm font-bold tabular-nums">{brl(e.amount)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{dayLabel(e.date)}{e.description ? ` · ${e.description}` : ""}</p>
                      <div className="mt-1 flex items-center gap-3">
                        {e.receiptPath && <button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => setViewPath(e.receiptPath!)}>Ver comprovante</button>}
                        {confirmDeleteId === e.id ? (
                          <span className="flex items-center gap-2 text-[11px]">
                            <button type="button" disabled={deletingId === e.id} className="font-semibold text-destructive hover:underline" onClick={() => void remove(e.id)}>{deletingId === e.id ? "Apagando..." : "Confirmar apagar"}</button>
                            <button type="button" className="text-muted-foreground hover:underline" onClick={() => setConfirmDeleteId(null)}>Não</button>
                          </span>
                        ) : (
                          <button type="button" aria-label="Apagar gasto" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteId(e.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ReceiptViewer path={viewPath} onClose={() => setViewPath(null)} />
    </>
  );
}
