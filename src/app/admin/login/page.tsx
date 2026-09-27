
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
import { Logo } from "@/components/Logo";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/context/AuthContext";
import { userService } from "@/services/supabase/userService";

export default function AdminLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const { user } = await login(email, password);
      toast({ title: "Login bem-sucedido!" });
      const profile = user ? await userService.getById(user.id) : null;
      const isTechnician = profile?.role === 'technician' || profile?.role === 'counter_technician';
      router.push(isTechnician ? "/" : "/admin/dashboard");
    } catch (err: any) {
      let errorMessage = "Ocorreu um erro desconhecido.";
      if (err.message === "Invalid login credentials") {
          errorMessage = 'Email ou senha inválidos.';
      } else if (err.message) {
          errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mx-auto max-w-sm bg-card border-sidebar-border/60 shadow-2xl shadow-black/30 backdrop-blur-none">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex justify-center">
          <Logo size={44} />
        </div>
        <CardTitle className="text-2xl">Login</CardTitle>
        <CardDescription>
          Acesse sua conta para continuar
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="grid gap-4">
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
            <div className="flex items-center">
              <Label htmlFor="password">Senha</Label>
            </div>
            <Input 
              id="password" 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>
          {error && (
             <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Entrando...' : 'Login'}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm space-y-2">
          <p>
            Não tem uma conta?{' '}
            <Link href="/signup" className="underline">
              Cadastre-se
            </Link>
          </p>
          <p>
            <Link href="/" className="underline">
              Voltar para a página inicial
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
