import { supabase } from "@/lib/supabase";
import { type Vehicle, type VehicleKmLog, type VehicleFuelType } from "@/lib/data";

type VehicleInput = Omit<Vehicle, 'id'>;
type KmLogInput = Omit<VehicleKmLog, 'id'>;

const vehicleFromDb = (row: any): Vehicle => ({
  id: row.id,
  plate: row.plate,
  model: row.model ?? undefined,
  fuelType: (row.fuel_type ?? undefined) as VehicleFuelType | undefined,
  avgKml: row.avg_kml != null ? Number(row.avg_kml) : undefined,
  currentOdometerKm: row.current_odometer_km ?? undefined,
  isActive: row.is_active !== false,
  notes: row.notes ?? undefined,
});

const vehicleToDb = (v: Partial<VehicleInput>) => ({
  ...(v.plate !== undefined && { plate: v.plate }),
  ...(v.model !== undefined && { model: v.model || null }),
  ...(v.fuelType !== undefined && { fuel_type: v.fuelType || null }),
  ...(v.avgKml !== undefined && { avg_kml: v.avgKml ?? null }),
  ...(v.currentOdometerKm !== undefined && { current_odometer_km: v.currentOdometerKm ?? null }),
  ...(v.isActive !== undefined && { is_active: v.isActive }),
  ...(v.notes !== undefined && { notes: v.notes || null }),
});

const logFromDb = (row: any): VehicleKmLog => ({
  id: row.id,
  vehicleId: row.vehicle_id,
  routeId: row.route_id ?? undefined,
  driverId: row.driver_id ?? undefined,
  logDate: row.log_date,
  odometerStart: row.odometer_start,
  odometerEnd: row.odometer_end ?? undefined,
  notes: row.notes ?? undefined,
});

// 23505 = violação de unicidade (placa repetida na unidade).
export const DUPLICATE_PLATE_CODE = '23505';

export const vehicleService = {
  async getAll(unidadeId?: string | null): Promise<Vehicle[]> {
    let query = supabase.from('vehicles').select('*').order('plate', { ascending: true });
    if (unidadeId) query = query.eq('unidade_id', unidadeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(vehicleFromDb);
  },

  // unidadeId: obrigatório na prática pro master (o gatilho do banco só preenche a unidade de quem não é master).
  async create(data: VehicleInput, unidadeId?: string | null): Promise<string> {
    const { data: row, error } = await supabase
      .from('vehicles')
      .insert({ ...vehicleToDb(data), ...(unidadeId ? { unidade_id: unidadeId } : {}) } as any)
      .select('id')
      .single();
    if (error) throw error;
    return row.id;
  },

  async update(id: string, data: Partial<VehicleInput>): Promise<void> {
    const { error } = await supabase.from('vehicles').update(vehicleToDb(data)).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) throw error;
  },

  /** Registros de km, do mais recente para o mais antigo. */
  async getKmLogs(unidadeId?: string | null, opts?: { vehicleId?: string; limit?: number }): Promise<VehicleKmLog[]> {
    let query = supabase
      .from('vehicle_km_logs')
      .select('*')
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(opts?.limit ?? 300);
    if (unidadeId) query = query.eq('unidade_id', unidadeId);
    if (opts?.vehicleId) query = query.eq('vehicle_id', opts.vehicleId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(logFromDb);
  },

  async createKmLog(data: KmLogInput, unidadeId?: string | null): Promise<string> {
    const { data: row, error } = await supabase
      .from('vehicle_km_logs')
      .insert({
        vehicle_id: data.vehicleId,
        route_id: data.routeId || null,
        driver_id: data.driverId || null,
        log_date: data.logDate,
        odometer_start: data.odometerStart,
        odometer_end: data.odometerEnd ?? null,
        notes: data.notes || null,
        ...(unidadeId ? { unidade_id: unidadeId } : {}),
      } as any)
      .select('id')
      .single();
    if (error) throw error;
    return row.id;
  },

  /** Fecha um registro em aberto informando o hodômetro de chegada. */
  async closeKmLog(id: string, odometerEnd: number): Promise<void> {
    const { error } = await supabase.from('vehicle_km_logs').update({ odometer_end: odometerEnd }).eq('id', id);
    if (error) throw error;
  },

  async removeKmLog(id: string): Promise<void> {
    const { error } = await supabase.from('vehicle_km_logs').delete().eq('id', id);
    if (error) throw error;
  },
};
