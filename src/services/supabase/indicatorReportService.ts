import { supabase } from "@/lib/supabase";
import { type IndicatorMetric, type IndicatorReport, type TrackedIndicatorMetric } from "@/lib/data";

export const indicatorReportService = {
  async getLatest(): Promise<IndicatorReport | null> {
    const { data, error } = await supabase
      .from('indicator_reports')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return this.mapFromDb(data);
  },

  // Substitui qualquer relatório anterior pelo recém-processado - só o mais
  // recente é usado para montar os gráficos.
  async replace(data: { fileName?: string; partnerName?: string; location?: string; metrics: IndicatorMetric[] }): Promise<IndicatorReport> {
    const { error: deleteError } = await supabase.from('indicator_reports').delete().not('id', 'is', null);
    if (deleteError) throw deleteError;

    const { data: newRow, error } = await supabase
      .from('indicator_reports')
      .insert({
        file_name: data.fileName,
        partner_name: data.partnerName,
        location: data.location,
        metrics: data.metrics,
      })
      .select()
      .single();

    if (error) throw error;
    return this.mapFromDb(newRow);
  },

  async getTrackedMetrics(): Promise<TrackedIndicatorMetric[]> {
    const { data, error } = await supabase
      .from('indicator_tracked_metrics')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      metricKey: row.metric_key,
      metricName: row.metric_name,
      metricSection: row.metric_section,
    }));
  },

  async setTrackedMetrics(metrics: { key: string; name: string; section: string }[]): Promise<void> {
    const { error: deleteError } = await supabase.from('indicator_tracked_metrics').delete().not('id', 'is', null);
    if (deleteError) throw deleteError;

    if (metrics.length === 0) return;

    const { error } = await supabase.from('indicator_tracked_metrics').insert(
      metrics.map(m => ({ metric_key: m.key, metric_name: m.name, metric_section: m.section }))
    );
    if (error) throw error;
  },

  mapFromDb(row: any): IndicatorReport {
    return {
      id: row.id,
      fileName: row.file_name,
      partnerName: row.partner_name,
      location: row.location,
      metrics: row.metrics || [],
      uploadedAt: new Date(row.uploaded_at),
    };
  },
};
