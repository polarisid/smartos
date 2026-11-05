"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { Download, FileImage, Inbox, Loader2, Pencil, Receipt, Search, Settings2, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cleanLines, cleanText, parseMoney } from "@/lib/quotes";
import { filterExpenses, groupByRoute, totalOf, totalsByCategory, type RouteExpense } from "@/lib/routeExpenses";
import { downloadSpreadsheet } from "@/lib/spreadsheetXml";
import { cn } from "@/lib/utils";
import { configService } from "@/services/supabase/configService";
import { routeExpenseService } from "@/services/supabase/routeExpenseService";
import { ReceiptViewer } from "@/components/routes/ReceiptViewer";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dayLabel = (key: string) => key.split("-").reverse().join("/");
const ALL = "__all__";

type Tab = "lancamentos" | "rotas";

export default function RouteExpensesPage() {
  const { activeUnidadeId, appUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Por padrão, o mês atual.
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [category, setCategory] = useState(ALL);
  const [technician, setTechnician] = useState(ALL);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("lancamentos");

  const [viewPath, setViewPath] = useState<string | null>(null);
  const [editing, setEditing] = useState<RouteExpense | null>(null);
  const [deleting, setDeleting] = useState<RouteExpense | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const { data: expenses = [], isLoading, error } = useQuery({
    queryKey: ["route-expenses", "admin", activeUnidadeId, appUser?.uid, from, to],
    queryFn: () => routeExpenseService.getAll(activeUnidadeId, { from: from || undefined, to: to || undefined }),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["expense-categories", activeUnidadeId ?? appUser?.unidadeId ?? null],
    queryFn: () => configService.getExpenseCategories(activeUnidadeId ?? appUser?.unidadeId ?? null),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["route-expenses"] });

  const visible = useMemo(() => filterExpenses(expenses, {
    category: category === ALL ? undefined : category,
    technician: technician === ALL ? undefined : technician,
    routeId: routeId || undefined,
    search,
  }), [expenses, category, technician, routeId, search]);

  const total = totalOf(visible);
  const byCategory = useMemo(() => totalsByCategory(visible), [visible]);
  const byRoute = useMemo(() => groupByRoute(visible), [visible]);
  const technicians = useMemo(() => [...new Set(expenses.map(e => e.createdByName).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "pt-BR")), [expenses]);
  const categoryOptions = useMemo(() => [...new Set([...categories, ...expenses.map(e => e.category)])], [categories, expenses]);
  const routeFilterName = routeId ? expenses.find(e => e.routeId === routeId)?.routeName || "Rota" : null;
  const hasFilter = category !== ALL || technician !== ALL || !!routeId || !!search;
  const maxCategory = byCategory[0]?.total || 0;

  const exportSheet = () => {
    downloadSpreadsheet("Gastos de rotas - " + (from || "inicio") + " a " + (to || "hoje"), [
      {
        name: "Lançamentos",
        headers: ["Data", "Rota", "Técnico", "Categoria", "Descrição", "Valor (R$)"],
        widths: [12, 34, 24, 18, 40, 14],
        rows: visible.map(e => ({ values: [dayLabel(e.date), e.routeName || "", e.createdByName || "", e.category, e.description || "", e.amount] })),
      },
      {
        name: "Por categoria",
        headers: ["Categoria", "Lançamentos", "Total (R$)"],
        widths: [24, 14, 16],
        rows: [...byCategory.map(c => ({ values: [c.category, c.count, c.total] })), { values: ["TOTAL", visible.length, total], tone: "blue" as const }],
      },
      {
        name: "Por rota",
        headers: ["Rota", "Lançamentos", "Total (R$)", ...categoryOptions],
        widths: [34, 14, 16, ...categoryOptions.map(() => 16)],
        rows: byRoute.map(g => ({ values: [g.routeName, g.count, g.total, ...categoryOptions.map(c => g.byCategory.find(x => x.category === c)?.total ?? 0)] })),
      },
    ]);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Receipt className="h-6 w-6" /> Gastos de Rotas</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Alimentação, hospedagem e outros gastos lançados pelos técnicos, com a foto do comprovante. Confira, ajuste e acompanhe o total por rota, técnico e período.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setCategoriesOpen(true)}><Settings2 className="h-4 w-4" /> Categorias</Button>
          <Button variant="outline" className="gap-1.5" disabled={visible.length === 0} onClick={exportSheet}><Download className="h-4 w-4" /> Exportar planilha</Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total no filtro</p>
          <p className="mt-2 text-3xl font-bold tabular-nums leading-none">{brl(total)}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{visible.length} lançamento(s) em {byRoute.length} rota(s)</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Por categoria</p>
          {byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum gasto no filtro.</p>
          ) : (
            <ul className="space-y-1.5">
              {byCategory.map(c => (
                <li key={c.category} className="grid grid-cols-[8rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                  <button type="button" className="truncate text-left font-medium hover:underline" onClick={() => setCategory(category === c.category ? ALL : c.category)} title="Filtrar por esta categoria">{c.category}</button>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${maxCategory > 0 ? Math.max(3, Math.round((c.total / maxCategory) * 100)) : 0}%` }} /></div>
                  <span className="tabular-nums">{brl(c.total)} <span className="text-[11px] text-muted-foreground">({c.count})</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Técnico</Label>
              <Select value={technician} onValueChange={setTechnician}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {technicians.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 pr-8" placeholder="Buscar rota, técnico ou descrição" value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpar a busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["lancamentos", "rotas"] as Tab[]).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
                className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-colors", tab === t ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                {t === "lancamentos" ? "Lançamentos" : "Total por rota"}
              </button>
            ))}
            {routeId && (
              <Badge variant="secondary" className="gap-1">Rota: {routeFilterName}<button type="button" aria-label="Tirar o filtro de rota" onClick={() => setRouteId(null)}><X className="h-3 w-3" /></button></Badge>
            )}
            {hasFilter && <Button variant="ghost" size="sm" onClick={() => { setCategory(ALL); setTechnician(ALL); setRouteId(null); setSearch(""); }}>Limpar filtros</Button>}
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y">{[0, 1, 2, 3].map(i => <div key={i} className="flex items-center gap-4 px-4 py-4"><Skeleton className="h-8 flex-1" /><Skeleton className="h-8 w-24" /></div>)}</div>
        ) : error ? (
          <p className="p-6 text-sm text-destructive">Não foi possível carregar os gastos. Confira se a migration 33_route_expenses.sql foi executada no Supabase.</p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Inbox className="h-6 w-6" /></span>
            <p className="font-medium">{expenses.length === 0 ? "Nenhum gasto neste período" : "Nenhum gasto encontrado"}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{expenses.length === 0 ? "Os técnicos lançam pelo botão Gastos no cartão da rota, no celular." : "Tente outros filtros."}</p>
          </div>
        ) : tab === "lancamentos" ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs">{dayLabel(e.date)}</TableCell>
                    <TableCell className="max-w-[14rem]"><button type="button" className="truncate text-left text-sm hover:underline" title="Ver só esta rota" onClick={() => setRouteId(e.routeId)}>{e.routeName || "—"}</button></TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{e.createdByName || "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{e.category}</Badge></TableCell>
                    <TableCell className="max-w-[18rem] whitespace-pre-line text-xs text-muted-foreground">{e.description || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">{brl(e.amount)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {e.receiptPath
                          ? <Button size="sm" variant="outline" className="gap-1" onClick={() => setViewPath(e.receiptPath!)}><FileImage className="h-3.5 w-3.5" /> Comprovante</Button>
                          : <span className="px-2 text-[11px] text-amber-700">sem foto</span>}
                        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Editar" onClick={() => setEditing(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Apagar" onClick={() => setDeleting(e)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="divide-y">
            {byRoute.map(g => (
              <button key={g.routeId} type="button" onClick={() => { setRouteId(g.routeId); setTab("lancamentos"); }}
                className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{g.routeName}</p>
                  <p className="text-[11px] text-muted-foreground">{g.count} lançamento(s) · último em {dayLabel(g.lastDate)}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {g.byCategory.map(c => <span key={c.category} className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums">{c.category}: {brl(c.total)}</span>)}
                  <span className="ml-2 text-base font-bold tabular-nums">{brl(g.total)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <ReceiptViewer path={viewPath} onClose={() => setViewPath(null)} />

      <EditDialog
        expense={editing}
        categories={categoryOptions}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void refresh(); toast({ title: "Gasto atualizado" }); }}
      />

      <Dialog open={!!deleting} onOpenChange={o => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar gasto?</DialogTitle>
            <DialogDescription>{deleting && `${deleting.category} · ${brl(deleting.amount)} · ${deleting.routeName || "rota"} · ${deleting.createdByName || ""}. A foto do comprovante também é apagada.`}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={async () => {
              const target = deleting;
              setDeleting(null);
              if (!target) return;
              try { await routeExpenseService.remove(target); await refresh(); toast({ title: "Gasto apagado" }); }
              catch (e: any) { toast({ variant: "destructive", title: "Não foi possível apagar", description: e?.message }); }
            }}>Apagar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CategoriesDialog
        open={categoriesOpen}
        categories={categories}
        unidadeId={activeUnidadeId ?? appUser?.unidadeId ?? null}
        onClose={() => setCategoriesOpen(false)}
        onSaved={() => { setCategoriesOpen(false); void queryClient.invalidateQueries({ queryKey: ["expense-categories"] }); toast({ title: "Categorias salvas" }); }}
      />
    </div>
  );
}

function EditDialog({ expense, categories, onClose, onSaved }: { expense: RouteExpense | null; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<{ id: string; category: string; amount: string; date: string; description: string } | null>(null);
  const [saving, setSaving] = useState(false);
  if (!expense) return null;
  // O rascunho só vale para o gasto aberto; ao abrir outro, começa dos dados dele.
  const d = draft && draft.id === expense.id ? draft : {
    id: expense.id, category: expense.category, amount: String(expense.amount).replace(".", ","), date: expense.date, description: expense.description || "",
  };
  const set = (patch: Partial<typeof d>) => setDraft({ ...d, ...patch });
  const close = () => { setDraft(null); onClose(); };
  const save = async () => {
    const amount = parseMoney(d.amount);
    if (!(amount > 0)) { toast({ variant: "destructive", title: "Informe um valor maior que zero." }); return; }
    if (!d.date) { toast({ variant: "destructive", title: "Informe a data." }); return; }
    setSaving(true);
    try {
      await routeExpenseService.update(expense.id, { category: d.category, amount, date: d.date, description: cleanLines(d.description) || null });
      setDraft(null);
      onSaved();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Não foi possível salvar", description: e?.message });
    } finally {
      setSaving(false);
    }
  };
  const options = categories.includes(d.category) ? categories : [d.category, ...categories];
  return (
    <Dialog open onOpenChange={o => !o && !saving && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar gasto</DialogTitle>
          <DialogDescription>{expense.routeName || "Rota"} · lançado por {expense.createdByName || "—"}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Categoria</Label>
            <Select value={d.category} onValueChange={v => set({ category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{options.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor (R$)</Label>
            <Input value={d.amount} inputMode="decimal" onChange={e => set({ amount: e.target.value.replace(/[^\d.,]/g, "") })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data</Label>
            <Input type="date" value={d.date} onChange={e => set({ date: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Textarea rows={2} value={d.description} onChange={e => set({ description: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={close}>Cancelar</Button>
          <Button disabled={saving} className="gap-1.5" onClick={save}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoriesDialog({ open, categories, unidadeId, onClose, onSaved }: { open: boolean; categories: string[]; unidadeId: string | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<string[] | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const list = draft ?? categories;
  const close = () => { setDraft(null); setNewName(""); onClose(); };
  const add = () => {
    const name = cleanText(newName);
    if (!name) return;
    if (list.some(c => c.toLowerCase() === name.toLowerCase())) { toast({ variant: "destructive", title: "Essa categoria já existe." }); return; }
    setDraft([...list, name.slice(0, 40)]);
    setNewName("");
  };
  const save = async () => {
    if (list.length === 0) { toast({ variant: "destructive", title: "Deixe pelo menos uma categoria." }); return; }
    setSaving(true);
    try {
      await configService.setExpenseCategories(list, unidadeId);
      setDraft(null);
      onSaved();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Não foi possível salvar", description: e?.message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={o => !o && !saving && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Categorias de gasto</DialogTitle>
          <DialogDescription>São as opções que o técnico vê ao lançar. Gastos já lançados mantêm o nome da categoria que tinham. A categoria "Outros" pede descrição ao técnico.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {list.map(c => (
            <li key={c} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
              <span>{c}</span>
              <button type="button" aria-label={`Remover ${c}`} className="text-muted-foreground hover:text-destructive" onClick={() => setDraft(list.filter(x => x !== c))}><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input value={newName} maxLength={40} placeholder="Nova categoria (ex.: Pedágio)" onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} />
          <Button type="button" variant="outline" onClick={add}>Adicionar</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={close}>Cancelar</Button>
          <Button disabled={saving || draft === null} className="gap-1.5" onClick={save}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
