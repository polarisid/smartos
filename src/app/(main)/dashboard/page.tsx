"use client";
import { useAppData } from "@/context/AppDataContext";
import { FirebaseSetupPrompt } from "@/components/FirebaseSetupPrompt";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

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
      return <FirebaseSetupPrompt />;
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
