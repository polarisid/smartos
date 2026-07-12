"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

const pathMap: Record<string, string> = {
  admin: "Painel Admin",
  dashboard: "Dashboard",
  analytics: "Análise de Produtividade",
  "service-orders": "Ordens de Serviço",
  technicians: "Técnicos",
  drivers: "Motoristas",
  users: "Usuários",
  indicators: "Indicadores",
  codes: "Códigos",
  presets: "Presets",
  returns: "Retornos",
  chargebacks: "Estornos",
  routes: "Rotas",
  "part-separation": "Conferência de Peças",
  checklists: "Checklists",
  triage: "Triagem IA",
};

export function Breadcrumb() {
  const pathname = usePathname();
  if (pathname === "/admin/login") return null;

  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center space-x-1.5 text-xs text-muted-foreground/80 md:mb-6 select-none animate-in fade-in duration-200">
      <Link
        href="/admin/dashboard"
        className="flex items-center hover:text-foreground transition-colors font-medium"
      >
        <Home className="mr-1 h-3.5 w-3.5" />
        <span>Início</span>
      </Link>

      {segments.map((segment, index) => {
        const url = `/${segments.slice(0, index + 1).join("/")}`;
        const label = pathMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
        const isLast = index === segments.length - 1;

        return (
          <React.Fragment key={url}>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/45" />
            {isLast ? (
              <span className="font-semibold text-foreground truncate max-w-[200px]">
                {label}
              </span>
            ) : (
              <Link
                href={url}
                className="hover:text-foreground transition-colors font-medium truncate max-w-[150px]"
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
