import { Sidebar } from "@/components/Sidebar";
import { Suspense } from "react";
import { PermissionErrorDisplay } from "@/components/PermissionErrorDisplay";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
      <div className="min-h-screen flex flex-col md:flex-row bg-background">
        <Sidebar />
        <main className="flex-1 flex flex-col w-full min-h-screen pt-[64px] md:pt-0 overflow-x-hidden relative">
            <Suspense fallback={null}>
                <PermissionErrorDisplay />
            </Suspense>
            <div className="flex-1 w-full p-4 md:p-8">
               {children}
            </div>
            <footer className="glass border-t p-4 flex-none text-center text-xs text-muted-foreground mt-auto">
                <p>SmartService OS - Feito com ❤️ para simplificar sua vida.</p>
            </footer>
        </main>
      </div>
  );
}
