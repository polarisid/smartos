"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Wrench, TrendingUp, Trophy, Map, QrCode, LogIn, Menu, Download, Shield, Camera, LogOut, ClipboardCheck, FolderOpen } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { appUser, logout } = useAuth();
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const isAdminOrMaster = appUser?.role === 'admin' || appUser?.role === 'master';

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/admin/login');
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
        event.preventDefault();
        setInstallPromptEvent(event);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    installPromptEvent.userChoice.then(() => {
        setInstallPromptEvent(null);
    });
  };

  // Agrupado pelo que o técnico faz no dia a dia (atender) x acompanha (resultado).
  const groups = [
    {
      label: "Atendimento",
      items: [
        { href: "/", label: "Lançar OS", icon: Wrench },
        { href: "/routes", label: "Rotas", icon: Map },
        { href: "/reports", label: "Relatório", icon: Camera },
        { href: "/meus-relatorios", label: "Meus Relatórios", icon: FolderOpen },
        { href: "/scanner", label: "Scanner", icon: QrCode },
      ],
    },
    {
      label: "Meu desempenho",
      items: [
        { href: "/producao", label: "Minha Produção", icon: ClipboardCheck },
        { href: "/dashboard", label: "Desempenho da Equipe", icon: TrendingUp },
        { href: "/ranking", label: "Ranking", icon: Trophy },
      ],
    },
  ];
  const routes = groups.flatMap(g => g.items);

  const SidebarContent = ({ withBell = false }: { withBell?: boolean }) => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border w-64 p-4 md:p-6">
      <div className="mb-8 flex items-center justify-between gap-2">
        <Logo size={32} withWordmark wordmarkClassName="text-xl text-sidebar-foreground" />
        {withBell && <NotificationBell />}
      </div>

      <nav className="flex-1 space-y-5">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/40">{group.label}</p>
            {group.items.map((route) => {
              const isActive = pathname === route.href;
              const i = routes.indexOf(route);
              return (
                <motion.div
                  key={route.href}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={route.href}
                    onClick={() => setOpen(false)}
                    className={`relative flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-foreground font-semibold'
                        : 'text-sidebar-foreground/60 font-medium hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-sidebar-primary" />
                    )}
                    <route.icon className={`w-5 h-5 ${isActive ? 'text-sidebar-primary' : ''}`} />
                    {route.label}
                  </Link>
                </motion.div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-2 pt-6 border-t border-sidebar-border">
        {installPromptEvent && (
            <Button onClick={handleInstallClick} variant="ghost" className="w-full justify-start rounded-xl font-semibold text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground">
                <Download className="mr-3 h-4 w-4" />
                Instalar Web App
            </Button>
        )}

        {isAdminOrMaster && (
          <Button asChild variant="ghost" className="w-full justify-start rounded-xl font-semibold text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <Link href="/admin/login">
              <Shield className="mr-3 h-4 w-4 text-sidebar-primary" />
              Painel Admin
            </Link>
          </Button>
        )}

        {appUser && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-sidebar-accent/50 border border-sidebar-border hover:bg-sidebar-accent transition-colors">
            <div className="flex items-center gap-3 overflow-hidden">
              <Avatar className="h-8 w-8 border-2 border-sidebar-primary/30">
                <AvatarFallback className="bg-sidebar-primary/15 text-sidebar-primary font-bold text-xs">
                  {appUser.name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm truncate text-sidebar-foreground">{appUser.name}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-sidebar-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:block h-screen sticky top-0 z-40">
        <SidebarContent withBell />
      </aside>

      <div className="md:hidden fixed top-0 w-full z-50 bg-sidebar text-sidebar-foreground border-b border-sidebar-border px-4 py-3 flex justify-between items-center shadow-sm">
         <Logo size={26} withWordmark wordmarkClassName="text-lg text-sidebar-foreground" />
         <div className="flex items-center gap-1">
         <NotificationBell />
         <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
               <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"><Menu className="w-6 h-6"/></Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 border-r-0 w-64">
               <SidebarContent />
            </SheetContent>
         </Sheet>
         </div>
      </div>
    </>
  );
}
