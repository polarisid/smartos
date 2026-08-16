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
  },

  async getBaseAddress(): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('configs')
        .select('value')
        .eq('id', 'base_address')
        .single();

      if (!error && data?.value?.address) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('smartos_base_address', data.value.address);
        }
        return data.value.address;
      }
    } catch (e) {
      console.warn("Could not fetch base address from Supabase, falling back to localStorage/default", e);
    }
    
    if (typeof window !== 'undefined') {
      const local = localStorage.getItem('smartos_base_address');
      if (local) return local;
    }
    return 'Aracaju';
  },

  async setBaseAddress(address: string, coords?: { lat: number; lng: number } | null): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.setItem('smartos_base_address', address);
    }
    const value: { address: string; lat?: number; lng?: number } = { address };
    if (coords) {
      value.lat = coords.lat;
      value.lng = coords.lng;
    }
    const { error } = await supabase
      .from('configs')
      .upsert({ id: 'base_address', value });

    if (error) throw error;
  },

  // Coordenadas fixadas manualmente pelo admin (arrastando o pino no mapa),
  // quando existirem, têm prioridade sobre geocodificar o texto do endereço -
  // evita depender da precisão da geocodificação automática para o ponto base.
  async getBaseCoords(): Promise<{ lat: number; lng: number } | null> {
    try {
      const { data, error } = await supabase
        .from('configs')
        .select('value')
        .eq('id', 'base_address')
        .single();

      if (!error && typeof data?.value?.lat === 'number' && typeof data?.value?.lng === 'number') {
        return { lat: data.value.lat, lng: data.value.lng };
      }
    } catch (e) {
      console.warn("Could not fetch base coords from Supabase", e);
    }
    return null;
  }
};
