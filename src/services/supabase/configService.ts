import { supabase } from "@/lib/supabase";
import type { TravelCostParams, PartCostParams, RepairCenterInfo } from "@/lib/data";
import { DEFAULT_TRAVEL_COST_PARAMS } from "@/lib/travelCost";
import { DEFAULT_PART_COST_PARAMS } from "@/lib/partCost";
import { DEFAULT_PLANNING_PARAMS, type PlanningParams } from "@/lib/routePlanning";

export type TechGoals = { cleaningsPerMonth: number; approvedBudgetsPerMonth: number };
export const DEFAULT_TECH_GOALS: TechGoals = { cleaningsPerMonth: 0, approvedBudgetsPerMonth: 0 };

const DEFAULT_REPAIR_CENTER: RepairCenterInfo = { name: "", address: "", phone: "" };

// unidadeId é opcional em tudo aqui: pra admin/técnico a RLS já resolve
// sozinha (só existe a própria linha), mas master vê a mesma config das 3
// unidades ao mesmo tempo - sem passar unidadeId (vindo do seletor de
// unidade), master não teria como ler/gravar uma unidade específica.
function withUnidade<T extends Record<string, any>>(query: any, unidadeId?: string | null) {
  return unidadeId ? query.eq('unidade_id', unidadeId) : query;
}

export const configService = {
  async getWebhookUrl(unidadeId?: string | null): Promise<string | null> {
    const { data, error } = await withUnidade(
      supabase.from('configs').select('value').eq('id', 'webhook'),
      unidadeId
    ).maybeSingle();

    if (error) throw error;
    return data?.value?.url || null;
  },

  async setWebhookUrl(url: string, unidadeId?: string | null): Promise<void> {
    const { error } = await supabase
      .from('configs')
      .upsert({ id: 'webhook', value: { url }, ...(unidadeId ? { unidade_id: unidadeId } : {}) });

    if (error) throw error;
  },

  async getTextTemplate(id: string, unidadeId?: string | null): Promise<string | null> {
    const { data, error } = await withUnidade(
      supabase.from('configs').select('value').eq('id', `template_${id}`),
      unidadeId
    ).maybeSingle();

    if (error) throw error;
    return data?.value?.template || null;
  },

  async setTextTemplate(id: string, template: string, unidadeId?: string | null): Promise<void> {
    const { error } = await supabase
      .from('configs')
      .upsert({ id: `template_${id}`, value: { template }, ...(unidadeId ? { unidade_id: unidadeId } : {}) });

    if (error) throw error;
  },

  async getBaseAddress(unidadeId?: string | null): Promise<string> {
    try {
      const { data, error } = await withUnidade(
        supabase.from('configs').select('value').eq('id', 'base_address'),
        unidadeId
      ).maybeSingle();

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

  async setBaseAddress(address: string, coords?: { lat: number; lng: number } | null, unidadeId?: string | null): Promise<void> {
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
      .upsert({ id: 'base_address', value, ...(unidadeId ? { unidade_id: unidadeId } : {}) });

    if (error) throw error;
  },

  // Coordenadas fixadas manualmente pelo admin (arrastando o pino no mapa),
  // quando existirem, têm prioridade sobre geocodificar o texto do endereço -
  // evita depender da precisão da geocodificação automática para o ponto base.
  async getBaseCoords(unidadeId?: string | null): Promise<{ lat: number; lng: number } | null> {
    try {
      const { data, error } = await withUnidade(
        supabase.from('configs').select('value').eq('id', 'base_address'),
        unidadeId
      ).maybeSingle();

      if (!error && typeof data?.value?.lat === 'number' && typeof data?.value?.lng === 'number') {
        return { lat: data.value.lat, lng: data.value.lng };
      }
    } catch (e) {
      console.warn("Could not fetch base coords from Supabase", e);
    }
    return null;
  },

  // Parâmetros da calculadora de custo de deslocamento (custo/km, taxa fixa,
  // margem, etc). Sempre devolve um objeto completo, preenchendo com os
  // defaults o que não estiver salvo.
  async getTravelCostParams(unidadeId?: string | null): Promise<TravelCostParams> {
    try {
      const { data, error } = await withUnidade(
        supabase.from('configs').select('value').eq('id', 'travel_cost'),
        unidadeId
      ).maybeSingle();

      if (!error && data?.value) {
        return { ...DEFAULT_TRAVEL_COST_PARAMS, ...data.value };
      }
    } catch (e) {
      console.warn("Could not fetch travel cost params from Supabase", e);
    }
    return { ...DEFAULT_TRAVEL_COST_PARAMS };
  },

  async setTravelCostParams(params: TravelCostParams, unidadeId?: string | null): Promise<void> {
    const { error } = await supabase
      .from('configs')
      .upsert({ id: 'travel_cost', value: params, ...(unidadeId ? { unidade_id: unidadeId } : {}) });

    if (error) throw error;
  },

  // Parâmetros da calculadora de custo de peça (margem padrão sobre o valor
  // de custo). Mesmo padrão do travel_cost: sempre devolve objeto completo.
  async getPartCostParams(unidadeId?: string | null): Promise<PartCostParams> {
    try {
      const { data, error } = await withUnidade(
        supabase.from('configs').select('value').eq('id', 'part_cost'),
        unidadeId
      ).maybeSingle();

      if (!error && data?.value) {
        return { ...DEFAULT_PART_COST_PARAMS, ...data.value };
      }
    } catch (e) {
      console.warn("Could not fetch part cost params from Supabase", e);
    }
    return { ...DEFAULT_PART_COST_PARAMS };
  },

  async setPartCostParams(params: PartCostParams, unidadeId?: string | null): Promise<void> {
    const { error } = await supabase
      .from('configs')
      .upsert({ id: 'part_cost', value: params, ...(unidadeId ? { unidade_id: unidadeId } : {}) });

    if (error) throw error;
  },

  // Tempos de atendimento por tipo de produto + expediente, usados pelo modo
  // planejamento das rotas. Sempre devolve objeto completo.
  async getPlanningParams(unidadeId?: string | null): Promise<PlanningParams> {
    try {
      const { data, error } = await withUnidade(
        supabase.from('configs').select('value').eq('id', 'planning'),
        unidadeId
      ).maybeSingle();

      if (!error && data?.value) {
        return {
          ...DEFAULT_PLANNING_PARAMS,
          ...data.value,
          durationByProduct: { ...(data.value.durationByProduct || {}) },
        };
      }
    } catch (e) {
      console.warn("Could not fetch planning params from Supabase", e);
    }
    return { ...DEFAULT_PLANNING_PARAMS, durationByProduct: {} };
  },

  async setPlanningParams(params: PlanningParams, unidadeId?: string | null): Promise<void> {
    const { error } = await supabase
      .from('configs')
      .upsert({ id: 'planning', value: params, ...(unidadeId ? { unidade_id: unidadeId } : {}) });

    if (error) throw error;
  },

  // Metas mensais por técnico (exibidas em "Minha Produção"). 0 = sem meta.
  async getTechGoals(unidadeId?: string | null): Promise<TechGoals> {
    try {
      const { data, error } = await withUnidade(
        supabase.from('configs').select('value').eq('id', 'tech_goals'),
        unidadeId
      ).maybeSingle();
      if (!error && data?.value) return { ...DEFAULT_TECH_GOALS, ...data.value };
    } catch (e) {
      console.warn("Could not fetch tech goals from Supabase", e);
    }
    return { ...DEFAULT_TECH_GOALS };
  },

  async setTechGoals(goals: TechGoals, unidadeId?: string | null): Promise<void> {
    const { error } = await supabase
      .from('configs')
      .upsert({ id: 'tech_goals', value: goals, ...(unidadeId ? { unidade_id: unidadeId } : {}) });
    if (error) throw error;
  },

  // Dados do centro de reparo (nome/endereço/telefone), pré-preenchidos no
  // cabeçalho do PDF de orçamento em vez de digitar toda vez.
  async getRepairCenter(unidadeId?: string | null): Promise<RepairCenterInfo> {
    try {
      const { data, error } = await withUnidade(
        supabase.from('configs').select('value').eq('id', 'repair_center'),
        unidadeId
      ).maybeSingle();

      if (!error && data?.value) {
        return { ...DEFAULT_REPAIR_CENTER, ...data.value };
      }
    } catch (e) {
      console.warn("Could not fetch repair center info from Supabase", e);
    }
    return { ...DEFAULT_REPAIR_CENTER };
  },

  async setRepairCenter(info: RepairCenterInfo, unidadeId?: string | null): Promise<void> {
    const { error } = await supabase
      .from('configs')
      .upsert({ id: 'repair_center', value: info, ...(unidadeId ? { unidade_id: unidadeId } : {}) });

    if (error) throw error;
  }
};
