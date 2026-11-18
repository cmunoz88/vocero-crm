"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** 068 — Elegir una contraseña nueva desde el enlace (de un solo uso, 1 hora). */
export default function RestablecerPage() {
  return (
    <Suspense>
      <Restablecer />
    </Suspense>
  );
}

function Restablecer() {
  const params = useSearchParams();
  const token = params.get("token");
  const invalido = params.get("error") === "INVALID_TOKEN" || !token;
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [loading, setLoading] = useState(false);

  const problema =
    nueva && nueva.length < 8
      ? "Al menos 8 caracteres."
      : repetida && nueva !== repetida
        ? "Las dos contraseñas no coinciden."
        : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (problema || !token) return;
    setLoading(true);
    setError(null);
    const { error: err } = await authClient.resetPassword({ newPassword: nueva, token });
    setLoading(false);
    if (err) {
      return setError(
        err.status === 400 ? "El enlace venció o ya se usó. Pide uno nuevo." : (err.message ?? "No se pudo cambiar.")
      );
    }
    setListo(true);
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>Contraseña nueva</CardTitle>
        {!listo && !invalido && <CardDescription>Elige una que no uses en otro lado.</CardDescription>}
      </CardHeader>
      <CardContent>
        {listo ? (
          <div className="space-y-3">
            <p role="status" className="text-sm text-success-text">
              Contraseña cambiada ✓ Se cerraron tus sesiones abiertas.
            </p>
            <Link href="/login" className="text-sm text-primary hover:underline">
              Entrar
            </Link>
          </div>
        ) : invalido ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">Este enlace venció o ya se usó.</p>
            <Link href="/olvide" className="text-sm text-primary hover:underline">
              Pedir uno nuevo
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rest-nueva">Contraseña nueva</Label>
              <Input id="rest-nueva" type="password" autoComplete="new-password" required value={nueva} onChange={(e) => setNueva(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rest-repetida">Repítela</Label>
              <Input id="rest-repetida" type="password" autoComplete="new-password" required value={repetida} onChange={(e) => setRepetida(e.target.value)} />
            </div>
            {(problema || error) && <p className="text-sm text-destructive">{problema ?? error}</p>}
            <Button type="submit" className="w-full" disabled={loading || Boolean(problema) || !nueva || !repetida}>
              {loading ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
