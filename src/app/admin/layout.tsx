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
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Wrench, LayoutGrid, Users as UsersIcon, Tag, LogOut, ClipboardCheck, Bookmark, History, Target, Route, ClipboardList, PackageSearch, FileMinus, Users, Truck, BarChart2, Activity } from "lucide-react"

// Static nav items defined outside component to prevent re-allocation on re-render
const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', Icon: LayoutGrid, tooltip: 'Dashboard' },
  { href: '/command-center', label: 'Command Center', Icon: Activity, tooltip: 'Command Center' },
  { href: '/admin/analytics', label: 'Análise de Produtividade', Icon: BarChart2, tooltip: 'Análise de Produtividade' },
  { href: '/admin/service-orders', label: 'Ordens de Serviço', Icon: ClipboardCheck, tooltip: 'Ordens de Serviço' },
  { href: '/admin/technicians', label: 'Técnicos', Icon: UsersIcon, tooltip: 'Técnicos' },
  { href: '/admin/drivers', label: 'Motoristas', Icon: Truck, tooltip: 'Motoristas' },
  { href: '/admin/users', label: 'Usuários', Icon: Users, tooltip: 'Usuários' },
  { href: '/admin/indicators', label: 'Indicadores', Icon: Target, tooltip: 'Indicadores' },
  { href: '/admin/codes', label: 'Códigos', Icon: Tag, tooltip: 'Códigos' },
  { href: '/admin/presets', label: 'Presets', Icon: Bookmark, tooltip: 'Presets' },
  { href: '/admin/returns', label: 'Retornos', Icon: History, tooltip: 'Retornos' },
  { href: '/admin/chargebacks', label: 'Estornos', Icon: FileMinus, tooltip: 'Estornos' },
  { href: '/admin/routes', label: 'Rotas', Icon: Route, tooltip: 'Rotas' },
  { href: '/admin/part-separation', label: 'Conferência de Peças', Icon: PackageSearch, tooltip: 'Conferência de Peças' },
  { href: '/admin/checklists', label: 'Checklists', Icon: ClipboardList, tooltip: 'Checklists' },
  { href: '/admin/triage', label: 'Triagem IA', Icon: Target, tooltip: 'Triagem Assistida por IA' },
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
            <Sidebar className="border-r border-border/40 bg-sidebar/80 backdrop-blur-xl overflow-x-hidden">
                <SidebarHeader>
                    <div className="flex items-center gap-3 p-2">
                        <div className="p-2 bg-gradient-to-br from-primary to-primary/70 rounded-xl shadow-lg shadow-primary/20">
                            <Wrench className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">Admin Panel</h2>
                    </div>
                </SidebarHeader>
                <SidebarContent className="px-2">
                    <SidebarMenu>
                        {NAV_ITEMS.map(({ href, label, Icon, tooltip }) => (
                            <SidebarMenuItem key={href}>
                                <SidebarMenuButton asChild isActive={isActive(href)} tooltip={tooltip} className="transition-all duration-200 hover:translate-x-1 data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium rounded-lg">
                                    <Link href={href}><Icon className="w-4 h-4" /> <span>{label}</span></Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarContent>
                <SidebarFooter>
                    <div className="flex items-center justify-between p-3 m-2 rounded-xl bg-background/40 backdrop-blur-md border border-border/50 hover:bg-background/60 transition-colors">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <Avatar className="h-9 w-9 border-2 border-primary/20">
                                <AvatarImage src="https://placehold.co/40x40.png" alt="Admin" data-ai-hint="user avatar" />
                                <AvatarFallback className="bg-primary/10 text-primary font-bold">{appUser?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-sm truncate">{appUser?.name || user?.email}</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" onClick={handleLogout}>
                           <LogOut className="w-4 h-4" />
                        </Button>
                    </div>
                </SidebarFooter>
            </Sidebar>

            <div className="flex-1 flex flex-col min-h-screen">
                <header className="p-4 border-b border-border/40 flex items-center gap-4 bg-card/80 backdrop-blur-xl md:hidden sticky top-0 z-50 shadow-sm">
                    <SidebarTrigger />
                    <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">Admin Panel</h2>
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
    return <div className="min-h-screen flex items-center justify-center"><p>Verificando permissões...</p></div>
  }

  if (pathname === '/admin/login') {
    return <main className="min-h-screen flex items-center justify-center p-4">{children}</main>
  }
  
  // If the user is an admin, show the content.
  if (user && appUser?.role === 'admin') {
    return <AdminSidebar>{children}</AdminSidebar>
  }

  // In all other cases (e.g., redirecting, or a non-admin somehow gets here),
  // show the loading message to prevent a blank screen.
  return <div className="min-h-screen flex items-center justify-center"><p>Verificando permissões...</p></div>;
}
