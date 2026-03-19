"use client"

import * as React from "react"
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
  SidebarTrigger,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Wrench, LayoutGrid, Users as UsersIcon, Tag, LogOut, ClipboardCheck, Bookmark, History, Target, Route, ClipboardList, PackageSearch, FileMinus, DollarSign, Users, Home, TrendingUp, Truck } from "lucide-react"
import { useEffect } from "react"

function AdminSidebar({children}: {children: React.ReactNode}) {
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
            <Sidebar>
                <SidebarHeader>
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary rounded-lg">
                            <Wrench className="w-6 h-6 text-primary-foreground" />
                        </div>
                        <h2 className="text-lg font-semibold">Admin Panel</h2>
                    </div>
                </SidebarHeader>
                <SidebarContent>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/dashboard')} tooltip="Dashboard">
                                <Link href="/admin/dashboard"><LayoutGrid /> <span>Dashboard</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                         <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/service-orders')} tooltip="Ordens de Serviço">
                                <Link href="/admin/service-orders"><ClipboardCheck /> <span>Ordens de Serviço</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/technicians')} tooltip="Técnicos">
                                <Link href="/admin/technicians"><UsersIcon /> <span>Técnicos</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/drivers')} tooltip="Motoristas">
                                <Link href="/admin/drivers"><Truck /> <span>Motoristas</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/users')} tooltip="Usuários">
                                <Link href="/admin/users"><Users /> <span>Usuários</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                         <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/indicators')} tooltip="Indicadores">
                                <Link href="/admin/indicators"><Target /> <span>Indicadores</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/codes')} tooltip="Códigos">
                                <Link href="/admin/codes"><Tag /> <span>Códigos</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/presets')} tooltip="Presets">
                                <Link href="/admin/presets"><Bookmark /> <span>Presets</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/returns')} tooltip="Retornos">
                                <Link href="/admin/returns"><History /> <span>Retornos</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/chargebacks')} tooltip="Estornos">
                                <Link href="/admin/chargebacks"><FileMinus /> <span>Estornos</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/routes')} tooltip="Rotas">
                                <Link href="/admin/routes"><Route /> <span>Rotas</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                         <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/part-separation')} tooltip="Conferência de Peças">
                                <Link href="/admin/part-separation"><PackageSearch /> <span>Conferência de Peças</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/checklists')} tooltip="Checklists">
                                <Link href="/admin/checklists"><ClipboardList /> <span>Checklists</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarContent>
                <SidebarFooter>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-background/50">
                        <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src="https://placehold.co/40x40.png" alt="Admin" data-ai-hint="user avatar" />
                                <AvatarFallback>{appUser?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-sm truncate">{appUser?.name || user?.email}</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout}>
                           <LogOut />
                        </Button>
                    </div>
                </SidebarFooter>
            </Sidebar>

            <div className="flex-1 flex flex-col">
                <header className="p-4 border-b flex items-center gap-4 bg-card md:hidden">
                    <SidebarTrigger />
                    <h2 className="text-lg font-semibold">Admin Panel</h2>
                </header>
                <SidebarInset>{children}</SidebarInset>
            </div>
        </SidebarProvider>
    )
}

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
