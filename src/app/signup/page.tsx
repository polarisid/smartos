
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

export default function SignupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { signup } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("O nome é obrigatório.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setError("");
    setIsLoading(true);

    try {
      await signup(email, password, name);
      toast({ title: "Conta criada com sucesso!", description: "Você já pode fazer o login." });
      router.push("/admin/login");
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
            <CardTitle className="text-2xl">Criar Conta</CardTitle>
            <CardDescription>
            Crie uma nova conta para acessar o sistema.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <form onSubmit={handleSignup} className="grid gap-4">
            <div className="grid gap-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input
                id="name"
                type="text"
                placeholder="Seu nome"
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
                placeholder="seu@email.com"
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
                <Label htmlFor="confirm-password">Confirmar Senha</Label>
                <Input 
                id="confirm-password" 
                type="password" 
                required 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                />
            </div>
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Criando conta...' : 'Cadastrar'}
            </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              <p>
                Já tem uma conta?{' '}
                <Link href="/admin/login" className="underline">
                    Faça login
                </Link>
              </p>
            </div>
        </CardContent>
        </Card>
    </main>
  );
}
