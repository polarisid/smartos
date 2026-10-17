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

  async getAll(unidadeId?: string | null): Promise<Route[]> {
    let query = supabase.from('routes').select('*').order('created_at', { ascending: false });
    if (unidadeId) query = query.eq('unidade_id', unidadeId);
    const { data, error } = await query;

    if (error) throw error;
    return data.map(this.mapFromDb);
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
    entries: Array<{ serviceOrder: string; partCode: string; trackingCode: string }>
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
        return { route: { ...latest, stops }, written };
      } catch (e) {
        if (e instanceof RouteConflictError) continue; // alguém salvou no meio: lê de novo e refaz
        throw e;
      }
    }
    throw new Error("Muitas pessoas salvando ao mesmo tempo. Tente de novo.");
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
  },

  async getActiveRoutes(unidadeId?: string | null): Promise<Route[]> {
    let query = supabase.from('routes').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (unidadeId) query = query.eq('unidade_id', unidadeId);
    const { data, error } = await query;

    if (error) throw error;
    return data.map(this.mapFromDb);
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
      routes: (data || []).map(this.mapFromDb),
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
    return row;
  }
};
