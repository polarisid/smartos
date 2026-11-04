import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { technicianService } from "@/services/supabase/technicianService";
import { serviceOrderService } from "@/services/supabase/serviceOrderService";
import { routeService } from "@/services/supabase/routeService";
import { returnService } from "@/services/supabase/returnService";
import { chargebackService } from "@/services/supabase/chargebackService";
import { indicatorService } from "@/services/supabase/indicatorService";
import { presetService } from "@/services/supabase/presetService";
import { codeService } from "@/services/supabase/codeService";
import { driverService } from "@/services/supabase/driverService";
import { checklistService } from "@/services/supabase/checklistService";
import { configService } from "@/services/supabase/configService";

// appUser?.uid entra em toda queryKey abaixo mesmo quando a query nem usa o uid
// pra filtrar nada - activeUnidadeId sozinho é sempre null pra quem não é master,
// então sem o uid a chave de cache ficava igual pra QUALQUER técnico/admin
// logado no mesmo aparelho/navegador. Resultado: trocar de conta sem dar reload
// da página podia mostrar os dados em cache do usuário anterior (de OUTRA
// unidade) até o cache expirar - um vazamento de isolamento entre unidades.
export function useTechnicians() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['technicians', activeUnidadeId, appUser?.uid],
    queryFn: () => technicianService.getAll(activeUnidadeId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useServiceOrders(limit?: number) {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['service-orders', limit, activeUnidadeId, appUser?.uid],
    queryFn: () => limit ? serviceOrderService.getRecentOrders(limit, activeUnidadeId) : serviceOrderService.getAll(activeUnidadeId),
    staleTime: 1 * 60 * 1000,
  });
}

// Pequeno hash para a chave de cache não carregar a lista inteira de números.
function hashNumbers(sorted: string[]): string {
  let h = 5381;
  for (const n of sorted) for (let i = 0; i < n.length; i++) h = ((h << 5) + h + n.charCodeAt(i)) | 0;
  return `${sorted.length}:${h}`;
}

/**
 * Só as OS lançadas para os números informados (as paradas das rotas na tela), em vez das N mais recentes da unidade.
 * A chave começa com 'service-orders': quem invalida esse prefixo (ex.: previsão da rota) atualiza esta também.
 */
export function useServiceOrdersByNumbers(numbers: string[]) {
  const { activeUnidadeId, appUser } = useAuth();
  const sorted = Array.from(new Set(numbers.filter(Boolean))).sort();
  return useQuery({
    queryKey: ['service-orders', 'by-numbers', hashNumbers(sorted), activeUnidadeId, appUser?.uid],
    queryFn: () => serviceOrderService.getByNumbers(sorted),
    enabled: sorted.length > 0,
    staleTime: 1 * 60 * 1000,
  });
}

/** OS lançadas com peça "de outra OS": é só o que precisa para saber o quanto cada OS de origem cedeu. */
export function useBorrowingOrders() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['service-orders', 'borrowing', activeUnidadeId, appUser?.uid],
    queryFn: () => serviceOrderService.getBorrowingOrders(activeUnidadeId),
    staleTime: 1 * 60 * 1000,
  });
}

export function useProductPhotoConfig() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['product-photo-config', activeUnidadeId, appUser?.uid],
    queryFn: () => configService.getProductPhotoConfig(activeUnidadeId),
    // Quem configura espera ver o efeito na hora: busca de novo a cada abertura da tela e ao voltar para o app.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

export function useActiveRoutes() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['routes', 'active', activeUnidadeId, appUser?.uid],
    queryFn: () => routeService.getActiveRoutes(activeUnidadeId),
    staleTime: 2 * 60 * 1000,
  });
}

// Rotas de entrega da unidade: só para saber o que cada OS já levou em outras rotas de entrega (aviso nos cartões das paradas).
export function useDeliveryRoutes() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['routes', 'delivery', activeUnidadeId, appUser?.uid],
    queryFn: () => routeService.getDeliveryRoutes(activeUnidadeId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDraftRoutes() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['routes', 'draft', activeUnidadeId, appUser?.uid],
    queryFn: () => routeService.getDraftRoutes(activeUnidadeId),
    staleTime: 30 * 1000, // 30s — planejamento muda frequentemente
  });
}

export function useAllRoutes() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['routes', 'all', activeUnidadeId, appUser?.uid],
    queryFn: () => routeService.getAll(activeUnidadeId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useReturns() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['returns', activeUnidadeId, appUser?.uid],
    queryFn: () => returnService.getAll(activeUnidadeId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useChargebacks() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['chargebacks', activeUnidadeId, appUser?.uid],
    queryFn: () => chargebackService.getAll(activeUnidadeId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useIndicators() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['indicators', activeUnidadeId, appUser?.uid],
    queryFn: () => indicatorService.getAll(activeUnidadeId),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePresets() {
  return useQuery({
    queryKey: ['presets'],
    queryFn: () => presetService.getAll(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCodeUsageCounts() {
  return useQuery({
    queryKey: ['service-orders', 'code-usage-counts'],
    queryFn: () => serviceOrderService.getCodeUsageCounts(),
    staleTime: 15 * 60 * 1000,
  });
}

export function useCodes() {
  return useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const [symptoms, repairs] = await Promise.all([
        codeService.getSymptoms(),
        codeService.getRepairs()
      ]);
      return {
        symptomCodes: symptoms || { "TV/AV": [], "DA": [] },
        repairCodes: repairs || { "TV/AV": [], "DA": [] }
      };
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useDrivers() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['drivers', activeUnidadeId, appUser?.uid],
    queryFn: () => driverService.getAll(activeUnidadeId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useChecklists() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['checklists', activeUnidadeId, appUser?.uid],
    queryFn: () => checklistService.getAll(activeUnidadeId),
    staleTime: 10 * 60 * 1000,
  });
}

export function useVisitTemplate() {
  const { activeUnidadeId, appUser } = useAuth();
  return useQuery({
    queryKey: ['visit-template', activeUnidadeId, appUser?.uid],
    queryFn: async () => {
      const template = await configService.getTextTemplate("visitAnnouncement", activeUnidadeId);
      return template || "Olá, bom dia! Somos da assistência técnica autorizada Samsung...";
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
