"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wrench, TrendingUp, Trophy, Map, QrCode, LogIn, Menu, Download, Shield, Camera } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Sidebar() {
  const pathname = usePathname();
  const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
  const [open, setOpen] = useState(false);

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

  const routes = [
    { href: "/", label: "Lançar OS", icon: Wrench },
    { href: "/dashboard", label: "Desempenho", icon: TrendingUp },
    { href: "/ranking", label: "Ranking", icon: Trophy },
    { href: "/routes", label: "Rotas", icon: Map },
    { href: "/scanner", label: "Scanner", icon: QrCode },
    { href: "/reports", label: "Relatório", icon: Camera },
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-card/60 backdrop-blur-xl border-r w-64 p-4 md:p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-8 text-primary">
        <Wrench className="w-7 h-7" />
        <h1 className="text-2xl font-bold tracking-tight">SmartOS</h1>
      </div>
      
      <nav className="flex-1 space-y-2">
        {routes.map((route, i) => {
          const isActive = pathname === route.href;
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
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 font-semibold' 
                    : 'hover:bg-muted text-muted-foreground font-medium hover:translate-x-1'
                }`}
              >
                <route.icon className={`w-5 h-5 ${isActive ? 'opacity-100' : 'opacity-70'}`} />
                {route.label}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 pt-6 border-t border-border/50">
        {installPromptEvent && (
            <Button onClick={handleInstallClick} variant="secondary" className="w-full justify-start rounded-xl font-bold">
                <Download className="mr-3 h-4 w-4" />
                Instalar Web App
            </Button>
        )}

        <Button asChild variant="outline" className="w-full justify-start rounded-xl font-bold shadow-sm">
          <Link href="/admin/login">
            <Shield className="mr-3 h-4 w-4 text-primary" />
            Painel Admin
          </Link>
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:block h-screen sticky top-0 z-40">
        <SidebarContent />
      </aside>
      
      <div className="md:hidden fixed top-0 w-full z-50 glass border-b px-4 py-3 flex justify-between items-center shadow-sm">
         <div className="flex items-center gap-2 text-primary">
            <Wrench className="w-6 h-6" />
            <h1 className="text-xl font-bold tracking-tight">SmartOS</h1>
         </div>
         <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
               <Button variant="ghost" size="icon" className="text-foreground"><Menu className="w-6 h-6"/></Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 border-r-0 w-64">
               <SidebarContent />
            </SheetContent>
         </Sheet>
      </div>
    </>
  );
}
