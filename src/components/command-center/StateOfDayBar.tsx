"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/*
  StateOfDayBar — barra-assinatura "Estado do Dia" do Command Center.
  Sempre visível acima das abas: medidor de operação (concluídos/pendências/
  sem registro sobre o total do dia) + KPIs em JetBrains Mono com cor semântica
  + relógio + indicador "Ao Vivo". Números em mono = cara de console; cor = estado.
*/

const TONES = {
  neutral: "text-slate-100",
  teal: "text-[#17E9B0]",
  amber: "text-amber-400",
  orange: "text-orange-400",
  red: "text-red-400",
  violet: "text-violet-300",
  muted: "text-slate-400",
} as const;

type Tone = keyof typeof TONES;

export function KpiFigure({
  label,
  value,
  tone = "neutral",
  suffix,
}: {
  label: string;
  value: number | string;
  tone?: Tone;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col min-w-0">
      <span className={`font-mono text-2xl md:text-[1.7rem] font-semibold tabular-nums leading-none ${TONES[tone]}`}>
        {value}
        {suffix && <span className="text-sm font-medium text-slate-500 ml-0.5">{suffix}</span>}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mt-1.5 truncate">{label}</span>
    </div>
  );
}

export type DayStats = {
  totalScheduledToday: number;
  completedToday: number;
  pendingToday: number;
  notDoneYet: number;
  atrasados: number;
  overdueBacklog: number;
  avgTimeMinutes: number;
};

export function StateOfDayBar({
  stats,
  currentTime,
  liveCount,
}: {
  stats: DayStats;
  currentTime: Date;
  liveCount: number;
}) {
  const total = stats.totalScheduledToday;
  const done = stats.completedToday;
  const pend = stats.pendingToday;
  const todo = stats.notDoneYet;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const seg = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#0f1c2e]/80 backdrop-blur-sm shadow-xl shadow-black/20">
      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {/* Identidade + medidor de operação (assinatura) */}
        <div className="flex-1 p-5 lg:p-6 border-b lg:border-b-0 lg:border-r border-white/10">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href="/admin/dashboard"
                title="Voltar ao painel e menu lateral"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#17E9B0] shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar
              </Link>
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-headline text-lg font-bold tracking-tight text-white">
                  Smart<span className="text-[#17E9B0]">OS</span>
                </span>
                <span className="text-slate-500 text-sm truncate">· Operação</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-[#17E9B0] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#17E9B0]" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#17E9B0]">Ao Vivo</span>
            </div>
          </div>

          <div className="flex items-end justify-between mb-2.5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl md:text-5xl font-bold tabular-nums text-white leading-none">
                {pct}
                <span className="text-2xl text-slate-500">%</span>
              </span>
              <span className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold pb-1">da operação</span>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-semibold text-white tabular-nums leading-none">{format(currentTime, "HH:mm")}</div>
              <div className="text-[11px] text-slate-500 capitalize mt-1">{format(currentTime, "EEE, d 'de' MMM", { locale: ptBR })}</div>
            </div>
          </div>

          {/* Barra segmentada: composição do dia */}
          <div className="h-2.5 w-full rounded-full bg-white/5 overflow-hidden flex">
            <div className="h-full bg-[#17E9B0] transition-all duration-700" style={{ width: `${seg(done)}%` }} />
            <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: `${seg(pend)}%` }} />
            <div className="h-full bg-white/10 transition-all duration-700" style={{ width: `${seg(todo)}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#17E9B0]" /> {done} concluídos</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> {pend} pendências</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white/20" /> {todo} sem registro</span>
          </div>
        </div>

        {/* KPIs do dia */}
        <div className="p-5 lg:p-6 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 lg:w-[460px]">
          <KpiFigure label="Programados" value={total} tone="neutral" />
          <KpiFigure label="Concluídos" value={done} tone="teal" />
          <KpiFigure label="Pendências" value={pend} tone="amber" />
          <KpiFigure label="Atrasados" value={stats.atrasados} tone="orange" />
          <KpiFigure label="Acúmulo" value={stats.overdueBacklog} tone={stats.overdueBacklog > 0 ? "red" : "muted"} />
          <KpiFigure label="Sem registro" value={todo} tone="muted" />
          <KpiFigure
            label="Tempo médio"
            value={stats.avgTimeMinutes > 0 ? stats.avgTimeMinutes : "--"}
            suffix={stats.avgTimeMinutes > 0 ? "min" : undefined}
            tone="violet"
          />
          <KpiFigure label="No radar" value={liveCount} tone="teal" />
        </div>
      </div>
    </section>
  );
}
