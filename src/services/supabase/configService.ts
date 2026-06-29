import { supabase } from "@/lib/supabase";

export const configService = {
  async getWebhookUrl(): Promise<string | null> {
    const { data, error } = await supabase
      .from('configs')
      .select('value')
      .eq('id', 'webhook')
      .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // No rows
        throw error;
    }
    
    return data?.value?.url || null;
  },

  async setWebhookUrl(url: string): Promise<void> {
    const { error } = await supabase
      .from('configs')
      .upsert({ id: 'webhook', value: { url } });

    if (error) throw error;
  },

  async getTextTemplate(id: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('configs')
      .select('value')
      .eq('id', `template_${id}`)
      .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data?.value?.template || null;
  },

  async setTextTemplate(id: string, template: string): Promise<void> {
    const { error } = await supabase
      .from('configs')
      .upsert({ id: `template_${id}`, value: { template } });

    if (error) throw error;
  }
};
