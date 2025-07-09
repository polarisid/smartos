import Link from "next/link";
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
import { Wrench } from "lucide-react";

export default function AdminLoginPage() {
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader className="text-center">
        <Wrench className="mx-auto h-12 w-12 text-primary mb-4" />
        <CardTitle className="text-2xl">Admin Login</CardTitle>
        <CardDescription>
          Acesse o painel de administração
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@example.com"
              required
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center">
              <Label htmlFor="password">Senha</Label>
            </div>
            <Input id="password" type="password" required />
          </div>
          <Button type="submit" className="w-full" asChild>
            <Link href="/admin/dashboard">Login</Link>
          </Button>
        </div>
        <div className="mt-4 text-center text-sm">
          <Link href="/" className="underline">
            Voltar para a página inicial
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
