
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/context/AuthContext";
import { type AppUser } from "@/lib/data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SetupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { signup } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppUser['role']>('admin');
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("O nome é obrigatório.");
      return;
    }
    setError("");
    setIsLoading(true);

    try {
      await signup(email, password, name, role);
      toast({ title: "Usuário criado com sucesso!", description: "Você já pode fazer o login." });
      if (role === 'admin') {
        router.push("/admin/login");
      } else {
        router.push("/counter-technician/login");
      }
    } catch (err: any) {
      let errorMessage = "Ocorreu um erro desconhecido.";
      switch (err.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'Este email já está em uso.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'O formato do email é inválido.';
          break;
        case 'auth/weak-password':
          errorMessage = 'A senha é muito fraca. Use pelo menos 6 caracteres.';
          break;
        default:
          errorMessage = 'Falha ao criar conta. Por favor, tente novamente.';
          break;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-muted">
        <Card className="mx-auto max-w-sm">
        <CardHeader className="text-center">
            <UserPlus className="mx-auto h-12 w-12 text-primary mb-4" />
            <CardTitle className="text-2xl">Setup de Usuários</CardTitle>
            <CardDescription>
            Página provisória para criar usuários Admin ou de Balcão.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <form onSubmit={handleSignup} className="grid gap-4">
            <div className="grid gap-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input
                id="name"
                type="text"
                placeholder="Nome do usuário"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                id="email"
                type="email"
                placeholder="usuario@email.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="password">Senha</Label>
                <Input 
                id="password" 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                />
            </div>
             <div className="grid gap-2">
                <Label htmlFor="role">Função</Label>
                 <Select value={role} onValueChange={(v) => setRole(v as AppUser['role'])}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="counter_technician">Técnico de Balcão</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Criando usuário...' : 'Cadastrar Usuário'}
            </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              <p>
                <Link href="/" className="underline">
                    Voltar para a página inicial
                </Link>
              </p>
            </div>
        </CardContent>
        </Card>
    </main>
  );
}
