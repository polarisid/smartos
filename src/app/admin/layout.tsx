
"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Wrench, LayoutGrid, Users, Tag, LogOut, ClipboardCheck, Bookmark, History, Target, Route, ClipboardList, PackageSearch } from "lucide-react"

function AdminSidebar({children}: {children: React.ReactNode}) {
    const pathname = usePathname()
    const isActive = (path: string) => pathname.startsWith(path) && (pathname === path || pathname.charAt(path.length) === '/')

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
                                <Link href="/admin/technicians"><Users /> <span>Técnicos</span></Link>
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
                            <SidebarMenuButton asChild isActive={isActive('/admin/routes')} tooltip="Rotas">
                                <Link href="/admin/routes"><Route /> <span>Rotas</span></Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                         <SidebarMenuItem>
                            <SidebarMenuButton asChild isActive={isActive('/admin/part-separation')} tooltip="Separação de Peças">
                                <Link href="/admin/part-separation"><PackageSearch /> <span>Separação de Peças</span></Link>
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
                                <AvatarFallback>A</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-sm">Admin</span>
                        </div>
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                           <Link href="/"><LogOut /></Link>
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
  const pathname = usePathname()

  if (pathname === '/admin/login') {
    return <main className="min-h-screen flex items-center justify-center p-4">{children}</main>
  }

  return <AdminSidebar>{children}</AdminSidebar>
}
