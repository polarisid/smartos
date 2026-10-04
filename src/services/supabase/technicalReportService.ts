import { supabase } from "@/lib/supabase";
import { type TechnicalReport, type TechnicalReportPhotoCategory } from "@/lib/data";

const BUCKET = "report-photos";

// `network` = vale a pena tentar de novo (conexão caiu/travou/servidor instável);
// false = erro definitivo (permissão, arquivo inválido) que retentar não resolve.
export class PhotoUploadError extends Error {
  network: boolean;
  status?: number;
  constructor(message: string, info: { network: boolean; status?: number }) {
    super(message);
    this.name = "PhotoUploadError";
    this.network = info.network;
    this.status = info.status;
  }
}

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

  // Listagem paginada/filtrada para o admin (não traz `photos`, que só é
  // necessário ao abrir o diálogo de um relatório específico — economiza
  // banda conforme o volume de relatórios cresce).
  // Relatórios de um técnico (tela "Meus Relatórios"), do mais novo pro mais antigo:
  // os que ele criou OU em que consta como técnico responsável (o campo do
  // formulário é escolhido à mão e pode ter ficado vazio ou ser o parceiro de rota).
  async getByTechnician(technicianId: string, limit: number = 100): Promise<TechnicalReport[]> {
    const { data, error } = await supabase
      .from('technical_reports')
      .select('*')
      .or(`technician_id.eq.${technicianId},created_by.eq.${technicianId}`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).map(this.mapFromDb);
  },

  async getPaginated(params: {
    page: number;
    pageSize: number;
    search?: string;
    dateFrom?: Date;
  }): Promise<{ reports: TechnicalReport[]; total: number }> {
    const { page, pageSize, search, dateFrom } = params;
    let query = supabase
      .from('technical_reports')
      .select('id, service_order_number, technician_name, product_model, ai_score, created_at, updated_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (dateFrom) {
      query = query.gte('created_at', dateFrom.toISOString());
    }
    if (search && search.trim()) {
      const q = search.trim().replace(/[%,]/g, '');
      query = query.or(`service_order_number.ilike.%${q}%,technician_name.ilike.%${q}%,product_model.ilike.%${q}%`);
    }

    const from = page * pageSize;
    const { data, error, count } = await query.range(from, from + pageSize - 1);

    if (error) throw error;
    return {
      reports: (data || []).map((row: any) => this.mapFromDb({ ...row, photos: [] })),
      total: count || 0,
    };
  },

  // Só os scores do recorte filtrado (sem paginação) — usado pra calcular a
  // média geral sem precisar carregar todas as linhas/fotos na tela.
  async getScoresInRange(params: { search?: string; dateFrom?: Date }): Promise<number[]> {
    let query = supabase.from('technical_reports').select('ai_score');
    if (params.dateFrom) {
      query = query.gte('created_at', params.dateFrom.toISOString());
    }
    if (params.search && params.search.trim()) {
      const q = params.search.trim().replace(/[%,]/g, '');
      query = query.or(`service_order_number.ilike.%${q}%,technician_name.ilike.%${q}%,product_model.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || [])
      .map((r: any) => r.ai_score)
      .filter((v: any) => v != null)
      .map(Number);
  },

  // Usado pra habilitar/desabilitar o botão "Ver Relatório" na lista de OSs
  // sem precisar carregar o relatório inteiro (fotos, etc).
  async getServiceOrderNumbersWithReports(serviceOrderNumbers: string[]): Promise<Set<string>> {
    if (serviceOrderNumbers.length === 0) return new Set();
    const { data, error } = await supabase
      .from('technical_reports')
      .select('service_order_number')
      .in('service_order_number', serviceOrderNumbers);

    if (error) throw error;
    return new Set((data || []).map((row: any) => row.service_order_number));
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

  buildPhotoPath(file: File, serviceOrderNumber: string, category: TechnicalReportPhotoCategory): string {
    const ext = file.name.split('.').pop() || 'jpg';
    return `${serviceOrderNumber}/${category}_${crypto.randomUUID()}.${ext}`;
  },

  // Upload direto na API REST do Storage via XHR (em vez do supabase-js) pra ter
  // o que o supabase-js não dá: progresso real do envio e detecção de conexão
  // travada. Sem isso, num sinal ruim o fetch simplesmente ficava pendurado e o
  // técnico via "Salvando..." pra sempre, sem erro nem sucesso.
  // `path` fixo permite retentar a mesma foto: se uma tentativa anterior chegou
  // ao servidor mas a resposta se perdeu, o "já existe" (409) conta como sucesso.
  async uploadReportPhoto(
    file: File,
    serviceOrderNumber: string,
    category: TechnicalReportPhotoCategory,
    opts?: { path?: string; onProgress?: (loaded: number, total: number) => void; stallTimeoutMs?: number }
  ): Promise<{ url: string; path: string }> {
    const path = opts?.path || this.buildPhotoPath(file, serviceOrderNumber, category);
    const stallTimeoutMs = opts?.stallTimeoutMs ?? 30000;

    const { data: sessionData } = await supabase.auth.getSession();
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const token = sessionData.session?.access_token || anonKey;
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${baseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', anonKey);
      xhr.setRequestHeader('Content-Type', file.type || 'image/jpeg');
      xhr.setRequestHeader('cache-control', 'max-age=3600');
      xhr.setRequestHeader('x-upsert', 'false');

      let lastProgressAt = Date.now();
      const stallTimer = setInterval(() => {
        if (Date.now() - lastProgressAt > stallTimeoutMs) {
          clearInterval(stallTimer);
          xhr.abort();
          reject(new PhotoUploadError('Envio travado (sem progresso). Verifique o sinal.', { network: true }));
        }
      }, 3000);
      const done = () => clearInterval(stallTimer);

      xhr.upload.onprogress = (e) => {
        lastProgressAt = Date.now();
        if (e.lengthComputable) opts?.onProgress?.(e.loaded, e.total);
      };
      xhr.onload = () => {
        done();
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let message = '';
        try { message = JSON.parse(xhr.responseText)?.message || ''; } catch { /* corpo não é JSON */ }
        // Tentativa anterior já tinha gravado o arquivo: conta como enviado.
        if (xhr.status === 409 || /already exists|duplicate/i.test(`${message} ${xhr.responseText}`)) return resolve();
        const retryable = xhr.status >= 500 || xhr.status === 408 || xhr.status === 429;
        reject(new PhotoUploadError(message || `Falha ao enviar a foto (HTTP ${xhr.status}).`, { network: retryable, status: xhr.status }));
      };
      xhr.onerror = () => { done(); reject(new PhotoUploadError('Sem conexão com o servidor ao enviar a foto.', { network: true })); };
      xhr.ontimeout = () => { done(); reject(new PhotoUploadError('Tempo esgotado ao enviar a foto.', { network: true })); };
      xhr.onabort = () => { done(); };
      xhr.timeout = 180000;
      lastProgressAt = Date.now();
      xhr.send(file);
    });

    opts?.onProgress?.(file.size, file.size);
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
      reportType: row.report_type || 'reparo',
      technicianId: row.technician_id,
      technicianName: row.technician_name,
      consumerName: row.consumer_name,
      productModel: row.product_model,
      serialNumber: row.serial_number,
      photos: row.photos || [],
      repairDescription: row.repair_description,
      observations: row.observations,
      responsibleName: row.responsible_name,
      responsibleSignature: row.responsible_signature,
      clientSignature: row.client_signature,
      aiScore: row.ai_score != null ? Number(row.ai_score) : undefined,
      aiScoreFeedback: row.ai_score_feedback,
      checklistTemplateId: row.checklist_template_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  },

  mapToDb(obj: Partial<TechnicalReport>): any {
    const row: any = {};
    if (obj.serviceOrderNumber !== undefined) row.service_order_number = obj.serviceOrderNumber;
    if (obj.reportType !== undefined) row.report_type = obj.reportType;
    if (obj.technicianId !== undefined) row.technician_id = obj.technicianId;
    if (obj.technicianName !== undefined) row.technician_name = obj.technicianName;
    if (obj.consumerName !== undefined) row.consumer_name = obj.consumerName;
    if (obj.productModel !== undefined) row.product_model = obj.productModel;
    if (obj.serialNumber !== undefined) row.serial_number = obj.serialNumber;
    if (obj.photos !== undefined) row.photos = obj.photos;
    if (obj.repairDescription !== undefined) row.repair_description = obj.repairDescription;
    if (obj.observations !== undefined) row.observations = obj.observations;
    if (obj.responsibleName !== undefined) row.responsible_name = obj.responsibleName;
    if (obj.responsibleSignature !== undefined) row.responsible_signature = obj.responsibleSignature;
    if (obj.clientSignature !== undefined) row.client_signature = obj.clientSignature;
    if (obj.aiScore !== undefined) row.ai_score = obj.aiScore;
    if (obj.aiScoreFeedback !== undefined) row.ai_score_feedback = obj.aiScoreFeedback;
    if (obj.checklistTemplateId !== undefined) row.checklist_template_id = obj.checklistTemplateId;
    return row;
  }
};
