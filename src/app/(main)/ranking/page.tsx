"use client";
import { useAppData } from "@/context/AppDataContext";
import { FirebaseSetupPrompt } from "@/components/FirebaseSetupPrompt";
import dynamic from "next/dynamic";
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
      return <FirebaseSetupPrompt />;
  }

  return (
    <div className="w-full animate-in fade-in ease-out duration-300">
      <h2 className="text-2xl font-bold tracking-tight mb-6">Ranking de Retornos</h2>
      <ReturnsRanking technicians={technicians} returns={returns} />
    </div>
  );
}
