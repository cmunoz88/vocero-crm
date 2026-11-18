"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * El formulario de entrada. 067 — Con `tenant` (en `/t/{slug}/login`), después
 * de entrar verifica que la cuenta sea de ESE negocio; si no, cierra la sesión
 * y lo dice, en vez de dejar a alguien en el negocio equivocado.
 */
export function LoginForm({
  tenant,
  motivo,
  mostrarRegistro = true,
}: {
  tenant?: { slug: string; name: string };
  motivo?: string;
  mostrarRegistro?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    motivo === "suspendido"
      ? "Este negocio está suspendido. Escríbele a quien administra la plataforma."
      : null
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn.email({ email, password });
    if (err) {
      setLoading(false);
      setError(
        err.status === 429
          ? "Demasiados intentos. Espera unos minutos."
          : "Correo o contraseña incorrectos."
      );
      return;
    }
    if (tenant) {
      const res = await fetch(`/api/tenant/${encodeURIComponent(tenant.slug)}/membership`, {
        cache: "no-store",
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { member?: boolean; suspended?: boolean } | null;
      if (!data?.member) {
        await signOut().catch(() => {});
        setLoading(false);
        setError(`Esta cuenta no pertenece a ${tenant.name}.`);
        return;
      }
      if (data.suspended) {
        await signOut().catch(() => {});
        setLoading(false);
        setError("Este negocio está suspendido. Escríbele a quien administra la plataforma.");
        return;
      }
    }
    setLoading(false);
    // A la raíz, no a la Bandeja: ahí se decide si toca la guía de inicio
    // (#86) o la Bandeja de siempre (o /admin, para el superusuario).
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </Button>
          {mostrarRegistro && (
            <p className="text-center text-sm text-muted-foreground">
              ¿Primera vez aquí?{" "}
              <Link href="/register" className="text-primary hover:underline">
                Crear la cuenta inicial
              </Link>
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
