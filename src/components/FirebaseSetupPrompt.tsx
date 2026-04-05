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
          Seu aplicativo não está conectado a um banco de dados Firebase. Escolha uma das opções abaixo para configurar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="new-project">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new-project">1. Nova Operação</TabsTrigger>
            <TabsTrigger value="existing-project">2. Usar Projeto Existente</TabsTrigger>
          </TabsList>
          <TabsContent value="new-project" className="mt-4">
            <Card className="border-green-500/50">
              <CardHeader>
                <CardTitle>Criar uma Nova Operação (Recomendado)</CardTitle>
                <CardDescription>
                  Ideal para um novo ambiente ou para começar do zero. O assistente criará e configurará um novo projeto Firebase para você.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm mb-4">
                  Para iniciar a configuração, basta pedir ao assistente:
                </p>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                    <code className="text-sm font-semibold">configurar o Firebase</code>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy("configurar o Firebase", "Comando copiado!")}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="existing-project" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Conectar a um Projeto Existente</CardTitle>
                  <CardDescription>
                    Se você já possui um projeto Firebase (ex: um clone da operação original) e deseja usá-lo, informe o ID do projeto ao assistente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="projectId">ID do Projeto Firebase</Label>
                        <Input id="projectId" placeholder="seu-id-de-projeto-aqui" disabled />
                        <p className="text-xs text-muted-foreground">Você pode encontrar o ID do Projeto nas configurações do seu projeto no Console do Firebase.</p>
                    </div>
                     <p className="text-sm">
                        Para conectar, peça ao assistente (substituindo o texto em colchetes):
                    </p>
                     <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                        <code className="text-sm font-semibold">conectar ao projeto [ID do seu projeto]</code>
                         <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy("conectar ao projeto [ID do seu projeto]", "Comando copiado!")}>
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                     <Alert className="mt-4">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Atenção</AlertTitle>
                        <AlertDescription>
                            Esta opção <strong>não</strong> clona os dados do banco de dados. Ela apenas conecta a aplicação a um projeto Firebase já existente. A clonagem de dados deve ser feita manually através do Console do Firebase (Importar/Exportar).
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
