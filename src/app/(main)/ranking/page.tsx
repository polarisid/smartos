"use client";
import { useAppData } from "@/context/AppDataContext";
import dynamic from "next/dynamic";
import { Trophy, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const ReturnsRanking = dynamic(
  () => import("@/components/dashboard/ReturnsRanking").then(m => m.ReturnsRanking),
  {
    loading: () => (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    ),
    ssr: false,
  }
);

export default function RankingPage() {
  const { technicians, returns, dataFetchError } = useAppData();

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
      <h2 className="text-2xl font-bold tracking-tight mb-6">Ranking de Retornos</h2>
      <ReturnsRanking technicians={technicians} returns={returns} />
    </div>
  );
}
