"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlarmClock, CheckCircle2, ChevronDown, ChevronUp, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  SUGGESTED_REMINDER_CATEGORIES, buildOrdersByOs, buildRoutesByOs, categoryCounts, cleanCategory, dueInfo, reminderState, sameCategory, sortReminders,
  type DueLevel, type ReminderStateKey, type RouteReminder,
} from "@/lib/routeReminders";
import { cn } from "@/lib/utils";
import type { Route, ServiceOrder } from "@/lib/data";
import { routeReminderService } from "@/services/supabase/routeReminderService";
import { routeService } from "@/services/supabase/routeService";

const dayLabel = (key: string) => key.split("-").reverse().join("/");

const STATE_META: Record<ReminderStateKey, { label: string; cls: string }> = {
  sem_os: { label: "Sem OS vinculada", cls: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300" },
  sem_rota: { label: "Ainda sem rota", cls: "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" },
  em_entrega: { label: "Na rota de entrega", cls: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300" },
  em_rota: { label: "Em rota", cls: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300" },
  visitada: { label: "Visitada com pendência", cls: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300" },
  atendida: { label: "Atendida", cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" },
  concluido: { label: "Concluído", cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" },
};

const DUE_CLS: Record<DueLevel, string> = {
  nenhum: "text-muted-foreground",
  ok: "text-muted-foreground",
  breve: "font-semibold text-amber-700 dark:text-amber-400",
  hoje: "font-semibold text-orange-700 dark:text-orange-400",
  vencido: "font-semibold text-red-700 dark:text-red-400",
};

type Form = { title: string; category: string; osNumber: string; clientName: string; city: string; dueDate: string; notes: string };
const EMPTY: Form = { title: "", category: "", osNumber: "", clientName: "", city: "", dueDate: "", notes: "" };

/**
 * Lembretes de OS críticas: o que não pode ser esquecido ao montar as rotas (ex.: "coletar o ar-condicionado até 27/11").
 * Com a OS informada, mostra sozinho se ela já entrou em rota e se já foi atendida.
 */
export function RouteReminders({ routes, serviceOrders }: { routes: Route[]; serviceOrders: ServiceOrder[] }) {
  const { activeUnidadeId, appUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDone, setShowDone] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<RouteReminder | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<RouteReminder | null>(null);

  const { data: reminders = [], isLoading, error } = useQuery({
    queryKey: ["route-reminders", activeUnidadeId, appUser?.uid],
    queryFn: () => routeReminderService.getAll(activeUnidadeId),
    enabled: !!appUser?.uid,
    refetchInterval: 60000,
  });
  const { data: deliveryRoutes = [] } = useQuery({
    queryKey: ["delivery-routes", appUser?.uid, activeUnidadeId],
    queryFn: () => routeService.getDeliveryRoutes(activeUnidadeId),
    enabled: !!appUser?.uid,
    staleTime: 60000,
  });

  const routesByOs = useMemo(() => buildRoutesByOs(routes, deliveryRoutes), [routes, deliveryRoutes]);
  const ordersByOs = useMemo(() => buildOrdersByOs(serviceOrders), [serviceOrders]);

  const items = useMemo(
    () => sortReminders(reminders).map(r => ({ r, state: reminderState(r, routesByOs, ordersByOs), due: dueInfo(r.dueDate, new Date()) })),
    [reminders, routesByOs, ordersByOs],
  );
  const open = items.filter(i => !i.r.doneAt);
  const doneCount = items.length - open.length;
  const base = showDone ? items : open;
  const categories = useMemo(() => categoryCounts(base.map(i => i.r)), [base]);
  // A categoria escolhida que deixou de ter lembretes (concluídos/apagados) volta para "Todas".
  const activeCat = catFilter && categories.some(c => c.category === catFilter) ? catFilter : null;
  const shown = activeCat ? base.filter(i => sameCategory(i.r.category, activeCat)) : base;
  // Sugestões do cadastro: as já usadas + as padrão (sem repetir).
  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    return [...reminders.map(r => cleanCategory(r.category)), ...SUGGESTED_REMINDER_CATEGORIES].filter(n => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
  }, [reminders]);
  const needsRoute = open.filter(i => i.state.key === "sem_rota" || i.state.key === "sem_os").length;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["route-reminders"] });

  const openForm = (r: RouteReminder | "new") => {
    setEditing(r);
    setForm(r === "new" ? EMPTY : {
      title: r.title, category: r.category || "", osNumber: r.osNumber || "", clientName: r.clientName || "", city: r.city || "", dueDate: r.dueDate || "", notes: r.notes || "",
    });
  };

  const save = async () => {
    if (!form.title.trim()) { toast({ variant: "destructive", title: "Escreva o que precisa ser lembrado" }); return; }
    setSaving(true);
    try {
      const input = { title: form.title, category: form.category, osNumber: form.osNumber, clientName: form.clientName, city: form.city, dueDate: form.dueDate, notes: form.notes };
      if (editing === "new") await routeReminderService.create({ ...input, createdByName: appUser?.name }, activeUnidadeId);
      else if (editing) await routeReminderService.update(editing.id, input);
      await refresh();
      setEditing(null);
      toast({ title: editing === "new" ? "Lembrete cadastrado" : "Lembrete atualizado" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Não foi possível salvar o lembrete", description: (e?.message || "") + " Confira se a migration 36_route_reminders.sql foi executada no Supabase." });
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (r: RouteReminder) => {
    setBusyId(r.id);
    try {
      await routeReminderService.setDone(r.id, !r.doneAt, appUser?.name);
      await refresh();
      toast({ title: r.doneAt ? "Lembrete reaberto" : "Lembrete concluído", description: r.title });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Não foi possível atualizar", description: e?.message });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await routeReminderService.remove(deleting.id);
      await refresh();
      setDeleting(null);
      toast({ title: "Lembrete apagado" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Não foi possível apagar", description: e?.message });
    } finally {
      setBusyId(null);
    }
  };

  // Sem a tabela (migration ainda não executada) a área some em vez de poluir a tela de Rotas.
  if (error) return null;

  return (
    <>
      <Card className={cn("overflow-hidden", needsRoute > 0 && "border-amber-300 dark:border-amber-800")}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <button type="button" className="flex items-center gap-2 text-left" onClick={() => setCollapsed(c => !c)} aria-expanded={!collapsed}>
            <AlarmClock className={cn("h-4 w-4", needsRoute > 0 ? "text-amber-600" : "text-muted-foreground")} />
            <span className="font-semibold">Lembretes</span>
            <Badge variant="secondary" className="tabular-nums">{open.length}</Badge>
            {needsRoute > 0 && <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{needsRoute} ainda sem rota</span>}
            {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          </button>
          <div className="flex items-center gap-2">
            {doneCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowDone(s => !s)}>{showDone ? "Ocultar concluídos" : `Ver concluídos (${doneCount})`}</Button>
            )}
            <Button size="sm" variant="outline" className="gap-1" onClick={() => openForm("new")}><Plus className="h-3.5 w-3.5" /> Novo lembrete</Button>
          </div>
        </div>

        {!collapsed && !isLoading && categories.length > 0 && (categories.length > 1 || categories[0].category !== "Sem categoria") && (
          <div className="flex flex-wrap items-center gap-1.5 border-t px-4 py-2">
            <button type="button" onClick={() => setCatFilter(null)} aria-pressed={!activeCat}
              className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors", !activeCat ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
              Todas <span className="tabular-nums opacity-70">{base.length}</span>
            </button>
            {categories.map(c => (
              <button key={c.category} type="button" onClick={() => setCatFilter(activeCat === c.category ? null : c.category)} aria-pressed={activeCat === c.category}
                className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors", activeCat === c.category ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                {c.category} <span className="tabular-nums opacity-70">{c.count}</span>
              </button>
            ))}
          </div>
        )}

        {!collapsed && (
          isLoading ? (
            <p className="flex items-center gap-2 border-t px-4 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
          ) : shown.length === 0 ? (
            <p className="border-t px-4 py-3 text-sm text-muted-foreground">Nenhum lembrete em aberto. Use "Novo lembrete" para anotar uma OS crítica (ex.: coleta com prazo) e acompanhar se ela entrou em rota e foi atendida.</p>
          ) : (
            <ul className="divide-y border-t">
              {shown.map(({ r, state, due }) => {
                const meta = STATE_META[state.key];
                return (
                  <li key={r.id} className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3", r.doneAt && "opacity-60")}>
                    <div className="min-w-0 flex-1 basis-64">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{r.title}</span>
                        {cleanCategory(r.category) && <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">{cleanCategory(r.category)}</Badge>}
                        {r.osNumber && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">{r.osNumber}</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[r.clientName, r.city].filter(Boolean).join(" · ")}
                        {(r.clientName || r.city) && r.notes ? " — " : ""}
                        <span className="whitespace-pre-line">{r.notes}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {!r.doneAt && (
                        <span className={cn("text-xs tabular-nums", DUE_CLS[due.level])} title={r.dueDate ? "Prazo " + dayLabel(r.dueDate) : undefined}>
                          {r.dueDate ? dayLabel(r.dueDate).slice(0, 5) + " · " : ""}{due.label}
                        </span>
                      )}
                      <Badge variant="outline" className={cn("whitespace-nowrap text-[11px]", meta.cls)}
                        title={state.attendedAt ? "Último lançamento em " + format(state.attendedAt, "dd/MM/yyyy HH:mm") : state.routeName}>
                        {meta.label}{state.routeName ? ": " + state.routeName : ""}{state.attendedAt ? " · " + format(state.attendedAt, "dd/MM") : ""}
                      </Badge>
                      <Button size="sm" variant={r.doneAt ? "ghost" : "outline"} className="h-7 gap-1 px-2 text-xs" disabled={busyId === r.id} onClick={() => toggleDone(r)}
                        title={r.doneAt ? "Concluído em " + format(r.doneAt, "dd/MM/yyyy HH:mm") + (r.doneByName ? " por " + r.doneByName : "") : "Dar este lembrete como resolvido"}>
                        {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : r.doneAt ? <RotateCcw className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        {r.doneAt ? "Reabrir" : "Concluir"}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Editar" onClick={() => openForm(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label="Apagar" onClick={() => setDeleting(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Novo lembrete" : "Editar lembrete"}</DialogTitle>
            <DialogDescription>Anote a OS crítica e o prazo. Com o número da OS, a tela mostra sozinha se ela entrou em rota e se foi atendida.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="rem-title">O que precisa ser feito *</Label>
              <Input id="rem-title" value={form.title} placeholder="Ex.: Coletar o ar-condicionado" onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rem-category">Categoria</Label>
              <Input id="rem-category" list="rem-category-options" value={form.category} maxLength={40} placeholder="Escolha ou digite (ex.: Troca RMA, Coleta)"
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
              <datalist id="rem-category-options">{categoryOptions.map(n => <option key={n} value={n} />)}</datalist>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="rem-os">Número da OS</Label>
                <Input id="rem-os" value={form.osNumber} inputMode="numeric" placeholder="Opcional"
                  onKeyDown={e => { if (e.key === " ") e.preventDefault(); }}
                  onChange={e => setForm(f => ({ ...f, osNumber: e.target.value.replace(/\s/g, "") }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rem-due">Prazo</Label>
                <Input id="rem-due" type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rem-client">Cliente</Label>
                <Input id="rem-client" value={form.clientName} placeholder="Opcional" onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rem-city">Cidade</Label>
                <Input id="rem-city" value={form.city} placeholder="Opcional" onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rem-notes">Observações</Label>
              <Textarea id="rem-notes" rows={3} value={form.notes} placeholder="Ex.: pedido da Samsung por e-mail; combinar horário com o cliente" onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={o => { if (!o) setDeleting(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apagar lembrete?</DialogTitle>
            <DialogDescription>{deleting?.title}. Isso não pode ser desfeito; para só tirar da lista, use "Concluir".</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busyId === deleting?.id}>Apagar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
