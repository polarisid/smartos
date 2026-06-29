"use client";

import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Copy } from "lucide-react";

export function FirebaseSetupPrompt() {
  const { toast } = useToast();

  const handleCopy = (text: string, title: string) => {
    navigator.clipboard.writeText(text);
    toast({ title });
  };

  return (
    <Card className="max-w-2xl mx-auto my-8 border-destructive">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <span>Configuração do Banco de Dados Necessária</span>
        </CardTitle>
        <CardDescription>
          Seu aplicativo não conseguiu carregar os dados. É provável que as tabelas do Supabase não tenham sido criadas ainda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="new-project">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="new-project">Executar Migrations no Supabase</TabsTrigger>
          </TabsList>
          <TabsContent value="new-project" className="mt-4">
            <Card className="border-green-500/50">
              <CardHeader>
                <CardTitle>Sincronizar o Banco (Push)</CardTitle>
                <CardDescription>
                  Você precisa enviar o esquema do banco de dados (migrations) que estão na pasta <code>supabase/migrations</code> para o seu projeto Supabase.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">
                  1. Abra o terminal na raiz do projeto e faça login no Supabase (se necessário):
                </p>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                    <code className="text-sm font-semibold">npx supabase login</code>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy("npx supabase login", "Comando copiado!")}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
                
                <p className="text-sm mt-4">
                  2. Vincule seu projeto local ao projeto remoto (já pegamos o ID do seu .env.local):
                </p>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                    <code className="text-sm font-semibold">npx supabase link --project-ref wftrcvrkgyslvmbstkwi</code>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy("npx supabase link --project-ref wftrcvrkgyslvmbstkwi", "Comando copiado!")}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>

                <p className="text-sm mt-4">
                  3. Envie as tabelas para o banco de dados:
                </p>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                    <code className="text-sm font-semibold">npx supabase db push</code>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy("npx supabase db push", "Comando copiado!")}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>

                <Alert className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Atenção</AlertTitle>
                    <AlertDescription>
                        Ao rodar o comando <code>link</code>, o Supabase pedirá a senha do seu banco de dados. Após o comando <code>db push</code>, todas as tabelas e políticas de segurança estarão prontas.
                    </AlertDescription>
                </Alert>

              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
