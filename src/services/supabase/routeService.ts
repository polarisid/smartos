import { supabase } from "@/lib/supabase";
import { type Route } from "@/lib/data";

export const routeService = {
  async getAll(): Promise<Route[]> {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .order('created_at', { ascending: false });

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

  async create(data: Omit<Route, 'id'>): Promise<string> {
    const dbData = this.mapToDb(data as Route);
    const { data: newDoc, error } = await supabase
      .from('routes')
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;
    return newDoc.id;
  },

  async update(id: string, data: Partial<Route>): Promise<void> {
    const dbData = this.mapToDb(data as Route);
    const { error } = await supabase
      .from('routes')
      .update(dbData)
      .eq('id', id);

    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('routes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getActiveRoutes(): Promise<Route[]> {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data.map(this.mapFromDb);
  },

  async getDraftRoutes(): Promise<Route[]> {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('is_draft', true)
      .order('planned_date', { ascending: true });

    if (error) throw error;
    return (data || []).map(this.mapFromDb);
  },

  async publishRoute(id: string): Promise<void> {
    const { error } = await supabase
      .from('routes')
      .update({ is_draft: false, is_active: true })
      .eq('id', id);

    if (error) throw error;
  },

  async getInactiveRoutesPaginated(pageSize: number, cutoffDate?: Date, lastVisible?: number): Promise<{ routes: Route[], lastVisible: number | null }> {
    let query = supabase
      .from('routes')
      .select('*')
      .eq('is_active', false)
      .eq('is_draft', false)
      .order('created_at', { ascending: false });

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
    return row;
  }
};
