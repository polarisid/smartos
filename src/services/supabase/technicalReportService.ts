import { supabase } from "@/lib/supabase";
import { type TechnicalReport, type TechnicalReportPhotoCategory } from "@/lib/data";

const BUCKET = "report-photos";

export const technicalReportService = {
  async getAll(): Promise<TechnicalReport[]> {
    const { data, error } = await supabase
      .from('technical_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(this.mapFromDb);
  },

  async getById(id: string): Promise<TechnicalReport | null> {
    const { data, error } = await supabase
      .from('technical_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this.mapFromDb(data);
  },

  async getByServiceOrderNumber(serviceOrderNumber: string): Promise<TechnicalReport[]> {
    const { data, error } = await supabase
      .from('technical_reports')
      .select('*')
      .eq('service_order_number', serviceOrderNumber)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(this.mapFromDb);
  },

  async create(data: Omit<TechnicalReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const dbData = this.mapToDb(data);
    const { data: newDoc, error } = await supabase
      .from('technical_reports')
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;
    return newDoc.id;
  },

  async update(id: string, data: Partial<TechnicalReport>): Promise<void> {
    const dbData = this.mapToDb(data);
    dbData.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from('technical_reports')
      .update(dbData)
      .eq('id', id);

    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('technical_reports')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async uploadReportPhoto(file: File, serviceOrderNumber: string, category: TechnicalReportPhotoCategory): Promise<{ url: string; path: string }> {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${serviceOrderNumber}/${category}_${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  async deleteReportPhoto(path: string): Promise<void> {
    await supabase.storage.from(BUCKET).remove([path]);
  },

  mapFromDb(row: any): TechnicalReport {
    return {
      id: row.id,
      serviceOrderNumber: row.service_order_number,
      technicianId: row.technician_id,
      technicianName: row.technician_name,
      consumerName: row.consumer_name,
      productModel: row.product_model,
      serialNumber: row.serial_number,
      photos: row.photos || [],
      observations: row.observations,
      responsibleName: row.responsible_name,
      responsibleSignature: row.responsible_signature,
      aiScore: row.ai_score != null ? Number(row.ai_score) : undefined,
      aiScoreFeedback: row.ai_score_feedback,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  },

  mapToDb(obj: Partial<TechnicalReport>): any {
    const row: any = {};
    if (obj.serviceOrderNumber !== undefined) row.service_order_number = obj.serviceOrderNumber;
    if (obj.technicianId !== undefined) row.technician_id = obj.technicianId;
    if (obj.technicianName !== undefined) row.technician_name = obj.technicianName;
    if (obj.consumerName !== undefined) row.consumer_name = obj.consumerName;
    if (obj.productModel !== undefined) row.product_model = obj.productModel;
    if (obj.serialNumber !== undefined) row.serial_number = obj.serialNumber;
    if (obj.photos !== undefined) row.photos = obj.photos;
    if (obj.observations !== undefined) row.observations = obj.observations;
    if (obj.responsibleName !== undefined) row.responsible_name = obj.responsibleName;
    if (obj.responsibleSignature !== undefined) row.responsible_signature = obj.responsibleSignature;
    if (obj.aiScore !== undefined) row.ai_score = obj.aiScore;
    if (obj.aiScoreFeedback !== undefined) row.ai_score_feedback = obj.aiScoreFeedback;
    return row;
  }
};
