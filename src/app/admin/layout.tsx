"use client"

import React, { useEffect, memo } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/context/AuthContext"
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LayoutGrid, Users as UsersIcon, Tag, LogOut, ClipboardCheck, Bookmark, History, Target, Route, ClipboardList, PackageSearch, FileMinus, Users, Truck, BarChart2, Activity, CalendarDays, Settings, Camera, Calculator, Loader2 } from "lucide-react"
import { Logo } from "@/components/Logo"

// Tela de carregamento com a identidade do app (logo + gradiente), em vez de
// texto solto num fundo em branco - é a primeira coisa que aparece em toda
// navegação, então vale a mesma atenção visual do resto do painel.
function AppLoadingScreen({ message }: { message: string }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-sidebar">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 15% 20%, rgba(23,233,176,0.10), transparent 40%), radial-gradient(circle at 85% 80%, rgba(76,111,255,0.14), transparent 40%)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center">
          <span className="absolute inline-flex h-16 w-16 rounded-3xl border-2 border-[#17E9B0]/25 animate-ping" />
          <Logo size={44} />
        </div>
        <div className="flex items-center gap-2 text-sidebar-foreground/70 text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin text-[#17E9B0]" />
          {message}
        </div>
      </div>
    </div>
  )
}

// Itens agrupados por função no dia a dia (não por ordem alfabética/de
// criação) - a estrutura em si vira uma pista de navegação: "onde eu
// acompanho as coisas" vs "onde eu trabalho" vs "onde eu cadastro" vs "onde
// eu configuro". Definido fora do componente pra não realocar a cada render.
const NAV_GROUPS = [
  {
    label: "Visão Geral",
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', Icon: LayoutGrid, tooltip: 'Dashboard' },
      { href: '/command-center', label: 'Command Center', Icon: Activity, tooltip: 'Command Center' },
      { href: '/admin/analytics', label: 'Análise de Produtividade', Icon: BarChart2, tooltip: 'Análise de Produtividade' },
      { href: '/admin/indicators', label: 'Indicadores', Icon: Target, tooltip: 'Indicadores' },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: '/admin/service-orders', label: 'Ordens de Serviço', Icon: ClipboardCheck, tooltip: 'Ordens de Serviço' },
      { href: '/admin/routes', label: 'Rotas', Icon: Route, tooltip: 'Rotas' },
      { href: '/admin/planejamento', label: 'Planejamento', Icon: CalendarDays, tooltip: 'Planejamento de Rotas' },
      { href: '/admin/part-separation', label: 'Conferência de Peças', Icon: PackageSearch, tooltip: 'Conferência de Peças' },
      { href: '/admin/cost-calculator', label: 'Calculadora de Custo', Icon: Calculator, tooltip: 'Calculadora de Custo de Deslocamento' },
      { href: '/admin/checklists', label: 'Checklists', Icon: ClipboardList, tooltip: 'Checklists' },
      { href: '/admin/reports', label: 'Relatórios Fotográficos', Icon: Camera, tooltip: 'Relatórios Fotográficos' },
      { href: '/admin/returns', label: 'Retornos', Icon: History, tooltip: 'Retornos' },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { href: '/admin/technicians', label: 'Técnicos', Icon: UsersIcon, tooltip: 'Técnicos' },
      { href: '/admin/drivers', label: 'Motoristas', Icon: Truck, tooltip: 'Motoristas' },
      { href: '/admin/users', label: 'Usuários', Icon: Users, tooltip: 'Usuários' },
      { href: '/admin/codes', label: 'Códigos', Icon: Tag, tooltip: 'Códigos' },
      { href: '/admin/presets', label: 'Presets', Icon: Bookmark, tooltip: 'Presets' },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: '/admin/settings', label: 'Configurações', Icon: Settings, tooltip: 'Configurações do Sistema' },
    ],
  },
] as const;

const AdminSidebar = memo(function AdminSidebar({children}: {children: React.ReactNode}) {
    const pathname = usePathname()
    const { user, logout, appUser } = useAuth();
    const isActive = (path: string) => pathname.startsWith(path) && (pathname === path || pathname.charAt(path.length) === '/')

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error("Failed to log out", error);
        }
    };

    return (
        <SidebarProvider>
            <Sidebar className="border-r border-sidebar-border bg-sidebar overflow-x-hidden">
                <SidebarHeader>
                    <div className="flex items-center gap-3 p-2">
                        <Logo size={30} />
                        <div className="leading-tight">
                            <p className="font-headline font-semibold text-sidebar-foreground">smart<span className="text-[#17E9B0]">OS</span></p>
                            <p className="text-[10px] font-mono uppercase tracking-widest text-sidebar-foreground/50">Painel Admin</p>
                        </div>
                    </div>
                </SidebarHeader>
                <SidebarContent className="px-2">
                    {NAV_GROUPS.map((group) => (
                        <SidebarGroup key={group.label} className="p-0 pt-3 first:pt-0">
                            <SidebarGroupLabel className="h-6 px-2 text-[10px] font-mono uppercase tracking-widest text-sidebar-foreground/40">
                                {group.label}
                            </SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    {group.items.map(({ href, label, Icon, tooltip }) => (
                                        <SidebarMenuItem key={href}>
                                            <SidebarMenuButton asChild isActive={isActive(href)} tooltip={tooltip} className="text-sidebar-foreground/60 transition-all duration-200 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground hover:translate-x-0.5 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground data-[active=true]:font-semibold rounded-lg [&[data-active=true]_svg]:text-sidebar-primary">
                                                <Link href={href}><Icon className="w-4 h-4" /> <span>{label}</span></Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ))}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    ))}
                </SidebarContent>
                <SidebarFooter>
                    <div className="flex items-center justify-between p-3 m-2 rounded-xl bg-sidebar-accent/50 border border-sidebar-border hover:bg-sidebar-accent transition-colors">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <Avatar className="h-9 w-9 border-2 border-sidebar-primary/30">
                                <AvatarImage src="https://placehold.co/40x40.png" alt="Admin" data-ai-hint="user avatar" />
                                <AvatarFallback className="bg-sidebar-primary/15 text-sidebar-primary font-bold">{appUser?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-sm truncate text-sidebar-foreground">{appUser?.name || user?.email}</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors" onClick={handleLogout}>
                           <LogOut className="w-4 h-4" />
                        </Button>
                    </div>
                </SidebarFooter>
            </Sidebar>

            <div className="flex-1 flex flex-col min-h-screen">
                <header className="p-4 border-b border-sidebar-border flex items-center gap-4 bg-sidebar md:hidden sticky top-0 z-50 shadow-sm">
                    <SidebarTrigger className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" />
                    <Logo size={26} withWordmark wordmarkClassName="text-lg text-sidebar-foreground" />
                </header>
                <SidebarInset className="bg-transparent">{children}</SidebarInset>
            </div>
        </SidebarProvider>
    )
});

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading, appUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Don't do anything while loading or on the login page itself.
    if (loading || pathname === '/admin/login') return;

    // If loading is done and there's no user, redirect to login.
    if (!user) {
      router.push('/admin/login');
      return;
    }
    
    // If loading is done and there IS a user, but they are not an admin
    // (either no appUser doc or role is not 'admin'), redirect to the home page with an error.
    if (!appUser || appUser.role !== 'admin') {
      router.push('/?error=permission_denied');
    }
  }, [user, appUser, loading, router, pathname]);

  if (loading) {
    return <AppLoadingScreen message="Verificando permissões..." />
  }

  if (pathname === '/admin/login') {
    return (
      <main className="relative min-h-screen flex items-center justify-center p-4 bg-sidebar overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 15% 20%, rgba(23,233,176,0.10), transparent 40%), radial-gradient(circle at 85% 80%, rgba(76,111,255,0.14), transparent 40%)",
          }}
        />
        <div className="relative z-10 w-full">{children}</div>
      </main>
    )
  }
  
  // If the user is an admin, show the content.
  if (user && appUser?.role === 'admin') {
    return <AdminSidebar>{children}</AdminSidebar>
  }

  // In all other cases (e.g., redirecting, or a non-admin somehow gets here),
  // show the loading message to prevent a blank screen.
  return <AppLoadingScreen message="Verificando permissões..." />;
}
