"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RevelarCredenciales() {
  const [token, setToken] = useState("");
  const [cred, setCred] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function revelar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/setup/credenciales", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    setLoading(false);
    const data = (await res?.json().catch(() => null)) as
      | { username?: string; password?: string; error?: { message?: string } }
      | null;
    if (!res?.ok || !data?.password) return setError(data?.error?.message ?? "No se pudo mostrar.");
    setToken("");
    setCred({ username: data.username ?? "", password: data.password });
  }

  return (
    <Card className="w-full max-w-md shadow-md">
      <CardHeader>
        <CardTitle>Credenciales del superadministrador</CardTitle>
        <CardDescription>Se muestran UNA sola vez. Después de verlas, esta página ya no tiene nada.</CardDescription>
      </CardHeader>
      <CardContent>
        {cred ? (
          <div className="space-y-4">
            <dl className="space-y-2 rounded-lg border bg-muted/40 p-3 font-mono text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Usuario</dt>
                <dd data-testid="cred-usuario">{cred.username}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Contraseña</dt>
                <dd data-testid="cred-password" className="break-all select-all">
                  {cred.password}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">
              Guárdala en tu gestor de contraseñas, entra y cámbiala en «Mi cuenta». Luego quita SETUP_REVEAL_TOKEN del despliegue.
            </p>
            <Link href="/login" className="text-sm text-primary hover:underline">
              Ir a entrar
            </Link>
          </div>
        ) : (
          <form onSubmit={revelar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="setup-token">Llave de instalación (SETUP_REVEAL_TOKEN)</Label>
              <Input id="setup-token" type="password" autoComplete="off" required value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !token}>
              {loading ? "Abriendo…" : "Mostrar una vez"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
