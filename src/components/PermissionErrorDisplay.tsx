"use client";

import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from 'next/link';

export function PermissionErrorDisplay() {
  const searchParams = useSearchParams();
  const permissionError = searchParams.get('error') === 'permission_denied';

  if (!permissionError) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto mt-4 w-full px-4 sm:px-6 md:px-8">
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Acesso ao Painel de Admin Negado</AlertTitle>
            <AlertDescription>
                Você foi redirecionado porque sua conta não tem permissão de administrador. 
                Para obter acesso, você precisa criar uma conta de administrador para esta operação.
                <br />
                <Button asChild variant="link" className="p-0 h-auto mt-2 text-white font-bold underline">
                    <Link href="/setup">Clique aqui para ir à página de configuração e criar um administrador.</Link>
                </Button>
            </AlertDescription>
        </Alert>
    </div>
  );
}
