"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** 068 — «¿Olvidaste tu contraseña?»: por nombre de usuario; el enlace va al correo verificado. */
export default function OlvidePage() {
  const [username, setUsername] = useState("");
  const [enviado, setEnviado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/cuenta/olvide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username }),
    }).catch(() => null);
    setLoading(false);
    const data = (await res?.json().catch(() => null)) as { message?: string; error?: { message?: string } } | null;
    if (!res?.ok) return setError(data?.error?.message ?? "No se pudo enviar. Intenta de nuevo.");
    setEnviado(data?.message ?? "Listo.");
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>¿Olvidaste tu contraseña?</CardTitle>
        <CardDescription>Escribe tu usuario y te mandamos un enlace a tu correo verificado.</CardDescription>
      </CardHeader>
      <CardContent>
        {enviado ? (
          <div className="space-y-4">
            <p role="status" className="text-sm">
              {enviado}
            </p>
            <p className="text-sm text-muted-foreground">
              ¿No te llega? Revisa el spam. Si tu correo no está verificado, pídele a quien administra la plataforma un enlace para restablecerla.
            </p>
            <Link href="/login" className="text-sm text-primary hover:underline">
              Volver a entrar
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="olvide-usuario">Usuario</Label>
              <Input
                id="olvide-usuario"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !username.trim()}>
              {loading ? "Enviando…" : "Enviarme el enlace"}
            </Button>
            <p className="text-center text-sm">
              <Link href="/login" className="text-primary hover:underline">
                Volver a entrar
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
