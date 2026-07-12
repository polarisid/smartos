import { useQuery } from "@tanstack/react-query";
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

export function useTechnicians() {
  return useQuery({
    queryKey: ['technicians'],
    queryFn: () => technicianService.getAll(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useServiceOrders(limit?: number) {
  return useQuery({
    queryKey: ['service-orders', limit],
    queryFn: () => limit ? serviceOrderService.getRecentOrders(limit) : serviceOrderService.getAll(),
    staleTime: 1 * 60 * 1000,
  });
}

export function useActiveRoutes() {
  return useQuery({
    queryKey: ['routes', 'active'],
    queryFn: () => routeService.getActiveRoutes(),
    staleTime: 2 * 60 * 1000,
  });
}

export function useReturns() {
  return useQuery({
    queryKey: ['returns'],
    queryFn: () => returnService.getAll(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useChargebacks() {
  return useQuery({
    queryKey: ['chargebacks'],
    queryFn: () => chargebackService.getAll(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useIndicators() {
  return useQuery({
    queryKey: ['indicators'],
    queryFn: () => indicatorService.getAll(),
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
  return useQuery({
    queryKey: ['drivers'],
    queryFn: () => driverService.getAll(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useChecklists() {
  return useQuery({
    queryKey: ['checklists'],
    queryFn: () => checklistService.getAll(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useVisitTemplate() {
  return useQuery({
    queryKey: ['visit-template'],
    queryFn: async () => {
      const template = await configService.getTextTemplate("visitAnnouncement");
      return template || "Olá, bom dia! Somos da assistência técnica autorizada Samsung...";
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
