import { supabase } from "@/lib/supabase";
import { type ServiceOrder } from "@/lib/data";

export const serviceOrderService = {
  async getPaginated(pageSize: number = 10, offset: number = 0, statusFilter?: 'abertas' | 'fechadas'): Promise<{ orders: ServiceOrder[], lastDoc: any, hasMore: boolean }> {
    let query = supabase
      .from('service_orders')
      .select('*', { count: 'exact' })
      .order('date', { ascending: false });

    if (statusFilter === 'abertas') {
      query = query.eq('is_finalized', false);
    } else if (statusFilter === 'fechadas') {
      query = query.eq('is_finalized', true);
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;

    if (error) throw error;

    const hasMore = count ? (offset + pageSize < count) : false;

    // Convert from snake_case to camelCase
    const orders = data.map(this.mapFromDb);

    return {
      orders,
      lastDoc: offset + pageSize, // Supabase uses offset instead of lastDoc for pagination
      hasMore
    };
  },

  async getRecentOrders(limitCount: number = 5): Promise<ServiceOrder[]> {
    const { data, error } = await supabase
      .from('service_orders')
      .select('*')
      .order('date', { ascending: false })
      .limit(limitCount);

    if (error) throw error;
    return data.map(this.mapFromDb);
  },

  async getOrdersSince(daysAgo: number): Promise<ServiceOrder[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysAgo);
    
    const { data, error } = await supabase
        .from('service_orders')
        .select('*')
        .gte('date', cutoff.toISOString())
        .order('date', { ascending: false });
        
    if (error) throw error;
    return data.map(this.mapFromDb);
  },

  async getAll(): Promise<ServiceOrder[]> {
    let allOrders: any[] = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('service_orders')
        .select('*')
        .order('date', { ascending: false })
        .range(from, from + step - 1);

      if (error) throw error;
      
      if (data && data.length > 0) {
        allOrders = [...allOrders, ...data];
        from += step;
      } else {
        hasMore = false;
      }

      if (data && data.length < step) {
          hasMore = false;
      }
    }

    return allOrders.map(this.mapFromDb);
  },

  async getOpenOrders(limitCount: number = 5): Promise<ServiceOrder[]> {
    const { data, error } = await supabase
      .from('service_orders')
      .select('*')
      .eq('is_finalized', false)
      .order('date', { ascending: false })
      .limit(limitCount);

    if (error) throw error;
    return data.map(this.mapFromDb);
  },

  async getOrdersByTechnician(technicianId: string): Promise<ServiceOrder[]> {
    const { data, error } = await supabase
      .from('service_orders')
      .select('*')
      .eq('technician_id', technicianId)
      .order('date', { ascending: false });

    if (error) throw error;
    return data.map(this.mapFromDb);
  },

  async create(data: Omit<ServiceOrder, 'id'>): Promise<string> {
    const generatedId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : (Math.random().toString(36).substring(2, 15) + Date.now().toString(36));
    const dbData = {
      id: generatedId,
      ...this.mapToDb(data as ServiceOrder)
    };
    const { data: newDoc, error } = await supabase
      .from('service_orders')
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;
    return newDoc.id;
  },

  async update(id: string, data: Partial<ServiceOrder>): Promise<void> {
    const dbData = this.mapToDb(data as ServiceOrder);
    const { error } = await supabase
      .from('service_orders')
      .update(dbData)
      .eq('id', id);

    if (error) throw error;
  },

  async updateStatus(id: string, isFinalized: boolean, pendingReason?: string): Promise<void> {
    const updateData: any = { is_finalized: isFinalized };
    if (!isFinalized && pendingReason) {
      updateData.pending_reason = pendingReason;
    } else if (isFinalized) {
      updateData.pending_reason = null;
    }

    const { error } = await supabase
      .from('service_orders')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('service_orders')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async searchByNumber(prefix: string): Promise<ServiceOrder[]> {
    const { data, error } = await supabase
      .from('service_orders')
      .select('*')
      .ilike('service_order_number', `${prefix}%`)
      .order('date', { ascending: false })
      .limit(20);

    if (error) throw error;
    return data.map(this.mapFromDb);
  },

  async getByNumbers(numbers: string[]): Promise<ServiceOrder[]> {
    if (numbers.length === 0) return [];
    const { data, error } = await supabase
      .from('service_orders')
      .select('*')
      .in('service_order_number', numbers);

    if (error) throw error;
    return data.map(this.mapFromDb);
  },

  // Helpers to map between DB snake_case and app camelCase
  mapFromDb(row: any): ServiceOrder {
    return {
      id: row.id,
      technicianId: row.technician_id,
      serviceOrderNumber: row.service_order_number,
      date: new Date(row.date),
      equipmentType: row.equipment_type,
      serviceType: row.service_type,
      samsungRepairType: row.samsung_repair_type,
      samsungBudgetApproved: row.samsung_budget_approved,
      samsungBudgetValue: row.samsung_budget_value,
      symptomCode: row.symptom_code,
      repairCode: row.repair_code,
      defectFound: row.defect_found,
      partsRequested: row.parts_requested,
      productCollectedOrInstalled: row.product_collected_or_installed,
      collectionType: row.collection_type,
      replacedPart: row.replaced_part,
      observations: row.observations,
      cleaningPerformed: row.cleaning_performed,
      isFinalized: row.is_finalized,
      pendingReason: row.pending_reason,
    };
  },

  mapToDb(obj: Partial<ServiceOrder>): any {
    const row: any = {};
    if (obj.technicianId !== undefined) row.technician_id = obj.technicianId;
    if (obj.serviceOrderNumber !== undefined) row.service_order_number = obj.serviceOrderNumber;
    if (obj.date !== undefined) row.date = obj.date instanceof Date ? obj.date.toISOString() : obj.date;
    if (obj.equipmentType !== undefined) row.equipment_type = obj.equipmentType;
    if (obj.serviceType !== undefined) row.service_type = obj.serviceType;
    if (obj.samsungRepairType !== undefined) row.samsung_repair_type = obj.samsungRepairType;
    if (obj.samsungBudgetApproved !== undefined) row.samsung_budget_approved = obj.samsungBudgetApproved;
    if (obj.samsungBudgetValue !== undefined) row.samsung_budget_value = obj.samsungBudgetValue;
    if (obj.symptomCode !== undefined) row.symptom_code = obj.symptomCode;
    if (obj.repairCode !== undefined) row.repair_code = obj.repairCode;
    if (obj.defectFound !== undefined) row.defect_found = obj.defectFound;
    if (obj.partsRequested !== undefined) row.parts_requested = obj.partsRequested;
    if (obj.productCollectedOrInstalled !== undefined) row.product_collected_or_installed = obj.productCollectedOrInstalled;
    if (obj.collectionType !== undefined) row.collection_type = obj.collectionType;
    if (obj.replacedPart !== undefined) row.replaced_part = obj.replacedPart;
    if (obj.observations !== undefined) row.observations = obj.observations;
    if (obj.cleaningPerformed !== undefined) row.cleaning_performed = obj.cleaningPerformed;
    if (obj.isFinalized !== undefined) row.is_finalized = obj.isFinalized;
    if (obj.pendingReason !== undefined) row.pending_reason = obj.pendingReason;
    return row;
  }
};
