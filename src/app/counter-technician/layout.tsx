
"use client";

import Link from "next/link";
import { Wrench, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


export default function CounterTechnicianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout, appUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (pathname === '/counter-technician/login') return;

    if (!user) {
      router.push('/counter-technician/login');
      return;
    }

    if (appUser && !['counter_technician', 'admin'].includes(appUser.role)) {
      router.push('/'); // Or a dedicated "access-denied" page
    }

  }, [user, appUser, loading, router, pathname]);


  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>Verificando permissões...</p></div>;
  }

  if (pathname === '/counter-technician/login') {
    return <main className="min-h-screen flex items-center justify-center p-4 bg-muted">{children}</main>;
  }

  if (!user || (appUser && !['counter_technician', 'admin'].includes(appUser.role))) {
    return null;
  }
  
  return (
    <div className="min-h-screen flex flex-col bg-muted/40">
      <header className="bg-card border-b p-4 flex justify-between items-center sticky top-0 z-40">
        <Link href="/counter-technician/dashboard" className="flex items-center gap-3 text-primary">
            <Wrench className="w-6 h-6 sm:w-7 sm:h-7" />
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Painel do Técnico de Balcão</h1>
        </Link>
         <div className="flex items-center gap-3">
             <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                    <AvatarImage src="https://placehold.co/40x40.png" alt="User" data-ai-hint="user avatar" />
                    <AvatarFallback>{appUser?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm hidden sm:inline">{appUser?.name}</span>
            </div>
            <Button onClick={handleLogout} variant="outline" size="sm">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
            </Button>
         </div>
      </header>
      <main className="flex-grow p-4 sm:p-6 md:p-8">
          {children}
      </main>
    </div>
  );
}
