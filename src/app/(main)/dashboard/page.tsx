"use client";
import { useAppData } from "@/context/AppDataContext";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

const PerformanceDashboard = dynamic(
  () => import("@/components/dashboard/PerformanceDashboard").then(m => m.PerformanceDashboard),
  {
    loading: () => (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    ),
    ssr: false,
  }
);

export default function DashboardPage() {
  const { technicians, serviceOrders, returns, indicators, chargebacks, dataFetchError } = useAppData();
  
  if (dataFetchError) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center h-[50vh]">
          <div className="rounded-full bg-destructive/10 p-4 mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">Erro de Conexão</h2>
          <p className="text-slate-500 max-w-md">Não foi possível conectar ao banco de dados. Verifique sua conexão com a internet ou tente novamente mais tarde.</p>
        </div>
      );
  }

  return (
    <div className="w-full animate-in fade-in ease-out duration-300">
      <h2 className="text-2xl font-bold tracking-tight mb-6">Desempenho da Equipe</h2>
      <PerformanceDashboard 
        technicians={technicians} 
        serviceOrders={serviceOrders} 
        returns={returns} 
        indicators={indicators}
        chargebacks={chargebacks}
      />
    </div>
  );
}
