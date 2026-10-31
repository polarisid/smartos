import { supabase } from "@/lib/supabase";
import { type Route } from "@/lib/data";

// A rota foi alterada por outra pessoa entre abrir e salvar.
export class RouteConflictError extends Error {
  constructor() {
    super('Esta rota foi alterada por outra pessoa desde que você a abriu.');
    this.name = 'RouteConflictError';
  }
}

// Colunas que o banco ainda não tem (migração pendente): o campo é descartado da gravação e a
// rota salva mesmo assim - em vez de o salvamento inteiro falhar por causa de uma opção nova.
const droppedColumns = new Set<string>();

function missingColumnOf(error: any, dbData: Record<string, unknown>): string | null {
  if (error?.code !== 'PGRST204') return null;
  const col = /'([^']+)' column/.exec(String(error.message || ''))?.[1];
  return col && col in dbData ? col : null;
}

export const routeService = {
  /** Campos que não foram gravados desde a última chamada porque falta a coluna no banco (limpa a lista). */
  consumeSchemaWarnings(): string[] {
    const list = Array.from(droppedColumns);
    droppedColumns.clear();
    return list;
  },

  // Rotas de entrega ficam de fora por padrão (não são rotas de atendimento: duplicariam OS nos painéis);
  // a Conferência de Peças pede com includeDelivery.
  async getAll(unidadeId?: string | null, opts?: { includeDelivery?: boolean }): Promise<Route[]> {
    let query = supabase.from('routes').select('*').order('created_at', { ascending: false });
    if (unidadeId) query = query.eq('unidade_id', unidadeId);
    const { data, error } = await query;

    if (error) throw error;
    const routes = data.map(this.mapFromDb);
    return opts?.includeDelivery ? routes : routes.filter(r => r.kind !== 'delivery');
  },

  async getDeliveryRoutes(unidadeId?: string | null): Promise<Route[]> {
    let query = supabase.from('routes').select('*').eq('kind', 'delivery').order('created_at', { ascending: false });
    if (unidadeId) query = query.eq('unidade_id', unidadeId);
    const { data, error } = await query;
    // Coluna ainda não existe (migração 25 pendente): não há rotas de entrega.
    if (error) { if ((error as any).code === '42703') return []; throw error; }
    return (data || []).map(this.mapFromDb);
  },

  // O banco já tem a coluna `kind` (migração 25)? Sem ela, uma "rota de entrega" nasceria como rota comum.
  async supportsDeliveryRoutes(): Promise<boolean> {
    const { error } = await supabase.from('routes').select('kind').limit(1);
    if (error) { if ((error as any).code === '42703') return false; throw error; }
    return true;
  },

  async getChildRoutes(parentId: string): Promise<Route[]> {
    const { data, error } = await supabase.from('routes').select('*').eq('parent_route_id', parentId).order('created_at', { ascending: true });
    if (error) { if ((error as any).code === '42703') return []; throw error; }
    return (data || []).map(this.mapFromDb);
  },

  async getById(id: string): Promise<Route | null> {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this.mapFromDb(data);
  },

  // unidadeId é opcional pra admin/técnico (a trigger set_unidade_id_on_insert
  // já preenche sozinha a partir da sessão) - mas pra master ela deliberadamente
  // NÃO preenche (master não tem unidade própria), e sem isso a rota era criada
  // com unidade_id NULL: salvava sem erro (RLS libera master ler/gravar tudo)
  // mas ficava invisível pra sempre em qualquer lista filtrada por unidade.
  async create(data: Omit<Route, 'id'>, unidadeId?: string | null): Promise<string> {
    const dbData = this.mapToDb(data as Route);
    if (unidadeId) dbData.unidade_id = unidadeId;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: newDoc, error } = await supabase
        .from('routes')
        .insert(dbData)
        .select()
        .single();

      const col = missingColumnOf(error, dbData);
      if (col) { delete dbData[col]; droppedColumns.add(col); continue; }
      if (error) throw error;
      return newDoc.id;
    }
    throw new Error('Não foi possível criar a rota.');
  },

  // expectedUpdatedAt: só grava se a rota ainda estiver como a pessoa abriu (controle de
  // edição simultânea, exige a coluna updated_at - migração 21). Recusa com RouteConflictError.
  // Devolve o novo updated_at (só quando o controle está ativo).
  async update(id: string, data: Partial<Route>, opts?: { expectedUpdatedAt?: string | null }): Promise<string | null> {
    const dbData = this.mapToDb(data as Route);
    const guarded = !!opts?.expectedUpdatedAt;
    for (let attempt = 0; attempt < 5; attempt++) {
      let query = supabase.from('routes').update(dbData).eq('id', id);
      if (guarded) query = query.eq('updated_at', opts!.expectedUpdatedAt as string);
      const { data: rows, error } = guarded ? await query.select('updated_at') : await query;

      const col = missingColumnOf(error, dbData);
      if (col) { delete dbData[col]; droppedColumns.add(col); continue; }
      if (error) throw error;
      if (guarded && (!rows || (rows as any[]).length === 0)) throw new RouteConflictError();
      return guarded ? ((rows as any[])[0]?.updated_at ?? null) : null;
    }
    throw new Error('Não foi possível atualizar a rota.');
  },

  /**
   * Grava códigos de rastreio de peças sem apagar o que outras pessoas bipam ao mesmo tempo.
   * Lê a rota NA HORA, aplica só as mudanças pedidas e grava com a trava de edição simultânea
   * (updated_at); se alguém salvou no meio, lê de novo e refaz (até 6 vezes).
   * Regra por entrada: só grava se há código novo (não vazio) diferente do que já está no banco -
   * um "salvar tudo" com a tela desatualizada nunca limpa nem desfaz o que outro bipou.
   * Devolve a rota como ficou e quantas peças foram realmente gravadas.
   */
  async patchPartTracking(
    routeId: string,
    entries: Array<{ serviceOrder: string; partCode: string; trackingCode: string }>,
    // propagate: rota de entrega <-> rotas filhas ficam em sincronia (padrão ligado; as chamadas internas desligam).
    opts?: { propagate?: boolean }
  ): Promise<{ route: Route; written: number }> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const latest = await this.getById(routeId);
      if (!latest) throw new Error("Rota não encontrada");

      let written = 0;
      const stops = (latest.stops || []).map(stop => {
        const mine = entries.filter(e => e.serviceOrder === stop.serviceOrder);
        if (mine.length === 0) return stop;
        return {
          ...stop,
          parts: (stop.parts || []).map(part => {
            const entry = mine.find(e => e.partCode === part.code);
            const code = entry?.trackingCode?.trim() || "";
            if (!entry || !code || code === (part.trackingCode || "")) return part;
            written++;
            return { ...part, trackingCode: code };
          }),
        };
      });

      if (written === 0) return { route: latest, written: 0 };

      try {
        await this.update(routeId, { stops }, { expectedUpdatedAt: latest.updatedAt || null });
        const result = { route: { ...latest, stops }, written };
        if (opts?.propagate !== false) {
          // Melhor esforço: a gravação principal já deu certo; falha aqui não pode desfazê-la.
          await this.propagateTracking(result.route, entries).catch(e => console.warn('Não foi possível sincronizar o rastreio com a rota vinculada:', e));
        }
        return result;
      } catch (e) {
        if (e instanceof RouteConflictError) continue; // alguém salvou no meio: lê de novo e refaz
        throw e;
      }
    }
    throw new Error("Muitas pessoas salvando ao mesmo tempo. Tente de novo.");
  },

  /**
   * Altera campos de paradas (ex.: o dia programado) sobre a versão ATUAL da rota, com a trava de edição
   * simultânea e nova tentativa - várias pessoas podem programar OS da mesma rota de entrega.
   */
  async patchStopFields(routeId: string, patches: Array<{ serviceOrder: string; fields: Record<string, unknown> }>): Promise<Route> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const latest = await this.getById(routeId);
      if (!latest) throw new Error("Rota não encontrada");
      const stops = (latest.stops || []).map(stop => {
        const patch = patches.find(p => p.serviceOrder === stop.serviceOrder);
        if (!patch) return stop;
        const next: any = { ...stop };
        Object.entries(patch.fields).forEach(([k, v]) => { if (v === undefined || v === null || v === "") delete next[k]; else next[k] = v; });
        return next;
      });
      try {
        await this.update(routeId, { stops }, { expectedUpdatedAt: latest.updatedAt || null });
        return { ...latest, stops };
      } catch (e) {
        if (e instanceof RouteConflictError) continue;
        throw e;
      }
    }
    throw new Error("Muitas pessoas salvando ao mesmo tempo. Tente de novo.");
  },

  /**
   * Rota de entrega e rotas filhas dividem as mesmas peças: o rastreio digitado em uma aparece na outra.
   * Da mãe vai para as filhas que levam a OS; da filha vai para a mãe.
   */
  async propagateTracking(route: Route, entries: Array<{ serviceOrder: string; partCode: string; trackingCode: string }>): Promise<void> {
    if (route.kind === 'delivery') {
      const children = (await this.getChildRoutes(route.id)).filter(c => !c.isCanceled);
      for (const child of children) {
        const own = new Set((child.stops || []).map(st => st.serviceOrder));
        const subset = entries.filter(e => own.has(e.serviceOrder));
        if (subset.length > 0) await this.patchPartTracking(child.id, subset, { propagate: false });
      }
    } else if (route.parentRouteId) {
      const parent = await this.getById(route.parentRouteId);
      if (!parent) return;
      const own = new Set((parent.stops || []).map(st => st.serviceOrder));
      const subset = entries.filter(e => own.has(e.serviceOrder));
      if (subset.length > 0) await this.patchPartTracking(parent.id, subset, { propagate: false });
    }
  },

  /**
   * Põe a rota de entrega e as filhas em dia: rastreio que só existe de um lado é copiado para o outro;
   * se os dois têm e são diferentes, vale o da rota de entrega (é onde o envio é controlado).
   */
  async syncDeliveryTracking(parentId: string): Promise<{ toChildren: number; toParent: number }> {
    const parent = await this.getById(parentId);
    if (!parent) throw new Error("Rota de entrega não encontrada");
    const children = (await this.getChildRoutes(parentId)).filter(c => !c.isCanceled);
    const codeOf = (r: Route, so: string, code: string) =>
      ((r.stops || []).find(st => st.serviceOrder === so)?.parts || []).find(p => p.code === code)?.trackingCode?.trim() || "";

    const toParent: Array<{ serviceOrder: string; partCode: string; trackingCode: string }> = [];
    let toChildren = 0;
    for (const child of children) {
      const forChild: Array<{ serviceOrder: string; partCode: string; trackingCode: string }> = [];
      for (const stop of child.stops || []) {
        for (const part of stop.parts || []) {
          const p = codeOf(parent, stop.serviceOrder, part.code);
          const c = (part.trackingCode || "").trim();
          if (p && p !== c) forChild.push({ serviceOrder: stop.serviceOrder, partCode: part.code, trackingCode: p });
          else if (!p && c) toParent.push({ serviceOrder: stop.serviceOrder, partCode: part.code, trackingCode: c });
        }
      }
      if (forChild.length > 0) {
        const r = await this.patchPartTracking(child.id, forChild, { propagate: false });
        toChildren += r.written;
      }
    }
    let written = 0;
    if (toParent.length > 0) written = (await this.patchPartTracking(parentId, toParent, { propagate: false })).written;
    return { toChildren, toParent: written };
  },

  async remove(id: string): Promise<void> {
    const route = await this.getById(id);
    if (route && route.isActive) {
      throw new Error("Uma rota já postada/publicada não pode ser excluída. É possível apenas inativá-la ou cancelá-la.");
    }
    const { error } = await supabase
      .from('routes')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // A exclusão já valeu; se a rota mãe não puder ser atualizada agora, não faz a exclusão parecer falha.
    if (route?.parentRouteId) {
      try { await this.releaseChildDays(route); } catch (e) { console.warn('Não foi possível liberar os dias da rota de entrega', e); }
    }
  },

  /**
   * Rota filha excluída: as OS que estavam nela voltam a ficar SEM dia programado na rota de entrega (mãe), a programar de
   * novo. OS que continuam em outra rota filha ativa da mesma mãe mantêm o dia.
   */
  async releaseChildDays(child: Route): Promise<void> {
    if (!child.parentRouteId) return;
    const parent = await this.getById(child.parentRouteId);
    if (!parent || parent.kind !== 'delivery') return;
    const stillScheduled = new Set<string>();
    (await this.getChildRoutes(parent.id))
      .filter(c => c.id !== child.id && !c.isCanceled)
      .forEach(c => (c.stops || []).filter(s => !s.isReallocated).forEach(s => stillScheduled.add(s.serviceOrder)));
    const hasDay = new Set((parent.stops || []).filter(s => s.plannedDay).map(s => s.serviceOrder));
    const release = (child.stops || [])
      .filter(s => !s.isReallocated && !stillScheduled.has(s.serviceOrder) && hasDay.has(s.serviceOrder))
      .map(s => ({ serviceOrder: s.serviceOrder, fields: { plannedDay: null } }));
    if (release.length > 0) await this.patchStopFields(parent.id, release);
  },

  // Exclui uma ROTA DE ENTREGA (a remove() comum recusa rotas ativas). As rotas filhas já criadas continuam,
  // só perdem o vínculo. Não mexe em nenhuma rota comum.
  async removeDeliveryRoute(id: string): Promise<void> {
    const route = await this.getById(id);
    if (!route) return;
    if (route.kind !== 'delivery') throw new Error("Esta não é uma rota de entrega.");
    const { error: unlinkError } = await supabase.from('routes').update({ parent_route_id: null }).eq('parent_route_id', id);
    if (unlinkError && (unlinkError as any).code !== '42703') throw unlinkError;
    const { error } = await supabase.from('routes').delete().eq('id', id).eq('kind', 'delivery');
    if (error) throw error;
  },

  async getActiveRoutes(unidadeId?: string | null): Promise<Route[]> {
    let query = supabase.from('routes').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (unidadeId) query = query.eq('unidade_id', unidadeId);
    const { data, error } = await query;

    if (error) throw error;
    return data.map(this.mapFromDb).filter(r => r.kind !== 'delivery');
  },

  async getDraftRoutes(unidadeId?: string | null): Promise<Route[]> {
    let query = supabase.from('routes').select('*').eq('is_draft', true).order('planned_date', { ascending: true });
    if (unidadeId) query = query.eq('unidade_id', unidadeId);
    const { data, error } = await query;

    if (error) throw error;
    return (data || []).map(this.mapFromDb);
  },

  async publishRoute(id: string, plannedDate?: Date): Promise<void> {
    const updatePayload: any = { is_draft: false, is_active: true };
    if (plannedDate) {
      updatePayload.departure_date = plannedDate instanceof Date ? plannedDate.toISOString() : plannedDate;
    }
    const { error } = await supabase
      .from('routes')
      .update(updatePayload)
      .eq('id', id);

    if (error) throw error;
  },

  async getInactiveRoutesPaginated(pageSize: number, cutoffDate?: Date, lastVisible?: number, unidadeId?: string | null): Promise<{ routes: Route[], lastVisible: number | null }> {
    let query = supabase
      .from('routes')
      .select('*')
      .eq('is_active', false)
      .eq('is_draft', false)
      .order('created_at', { ascending: false });

    if (unidadeId) {
      query = query.eq('unidade_id', unidadeId);
    }

    if (cutoffDate) {
      query = query.gte('created_at', cutoffDate.toISOString());
    }

    if (lastVisible !== undefined && lastVisible !== null) {
      query = query.range(lastVisible, lastVisible + pageSize - 1);
    } else {
      query = query.range(0, pageSize - 1);
    }

    const { data, error } = await query;

    if (error) throw error;

    const newLastVisible = (lastVisible || 0) + (data?.length || 0);

    return {
      routes: (data || []).map(this.mapFromDb).filter(r => r.kind !== 'delivery'),
      lastVisible: newLastVisible
    };
  },

  async updateBatch(updates: { id: string, data: Partial<Route> }[]): Promise<void> {
    await Promise.all(updates.map(u => this.update(u.id, u.data)));
  },

  async finishRoute(id: string, arrivalDate: Date): Promise<void> {
    await this.update(id, { isActive: false, arrivalDate: arrivalDate });
  },

  mapFromDb(row: any): Route {
    return {
      id: row.id,
      name: row.name,
      stops: row.stops || [],
      isActive: row.is_active,
      isCanceled: row.is_canceled,
      isDraft: row.is_draft || false,
      plannedDate: row.planned_date ? new Date(row.planned_date) : undefined,
      departureDate: row.departure_date ? new Date(row.departure_date) : undefined,
      arrivalDate: row.arrival_date ? new Date(row.arrival_date) : undefined,
      routeType: row.route_type,
      licensePlate: row.license_plate,
      technicianId: row.technician_id,
      technicianName: row.technician_name,
      driverId: row.driver_id,
      driverName: row.driver_name,
      driverPhone: row.driver_phone,
      startPoint: row.start_point || null,
      endPoint: row.end_point || null,
      departureTime: row.departure_time || undefined,
      updatedAt: row.updated_at || undefined,
      dailyReturn: row.daily_return === true,
      kind: row.kind === 'delivery' ? 'delivery' : 'normal',
      parentRouteId: row.parent_route_id || undefined,
      createdAt: new Date(row.created_at)
    };
  },

  mapToDb(obj: Partial<Route>): any {
    const row: any = {};
    if (obj.name !== undefined) row.name = obj.name;
    if (obj.stops !== undefined) row.stops = obj.stops;
    if (obj.isActive !== undefined) row.is_active = obj.isActive;
    if (obj.isCanceled !== undefined) row.is_canceled = obj.isCanceled;
    if (obj.isDraft !== undefined) row.is_draft = obj.isDraft;
    if (obj.plannedDate !== undefined) row.planned_date = obj.plannedDate instanceof Date ? obj.plannedDate.toISOString() : obj.plannedDate;
    if (obj.departureDate !== undefined) row.departure_date = obj.departureDate instanceof Date ? obj.departureDate.toISOString() : obj.departureDate;
    if (obj.arrivalDate !== undefined) row.arrival_date = obj.arrivalDate instanceof Date ? obj.arrivalDate.toISOString() : obj.arrivalDate;
    if (obj.routeType !== undefined) row.route_type = obj.routeType;
    if (obj.licensePlate !== undefined) row.license_plate = obj.licensePlate;
    if (obj.technicianId !== undefined) row.technician_id = obj.technicianId;
    if (obj.technicianName !== undefined) row.technician_name = obj.technicianName;
    if (obj.driverId !== undefined) row.driver_id = obj.driverId;
    if (obj.driverName !== undefined) row.driver_name = obj.driverName;
    if (obj.driverPhone !== undefined) row.driver_phone = obj.driverPhone;
    // null limpa o ponto (volta pra base da unidade); undefined não mexe.
    if (obj.startPoint !== undefined) row.start_point = obj.startPoint;
    if (obj.endPoint !== undefined) row.end_point = obj.endPoint;
    // Hora de saída do 1º dia ("HH:mm"); null/"" volta ao início do expediente.
    if (obj.departureTime !== undefined) row.departure_time = obj.departureTime || null;
    // Só enviado quando definido (migração 23): rota que nunca usou a opção não depende da coluna.
    if (obj.dailyReturn !== undefined) row.daily_return = !!obj.dailyReturn;
    // Só enviados quando definidos (migração 25): rota comum nunca depende dessas colunas.
    if (obj.kind !== undefined && obj.kind !== 'normal') row.kind = obj.kind;
    if (obj.parentRouteId !== undefined) row.parent_route_id = obj.parentRouteId;
    return row;
  }
};
