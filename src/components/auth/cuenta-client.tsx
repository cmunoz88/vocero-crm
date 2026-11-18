"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** 067 — Cambiar la propia contraseña (pide la actual). */
export function CuentaClient({ name, email }: { name: string; email: string }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const problema =
    nueva && nueva.length < 8
      ? "La nueva contraseña necesita al menos 8 caracteres."
      : repetida && nueva !== repetida
        ? "Las dos contraseñas nuevas no coinciden."
        : nueva && nueva === actual
          ? "La nueva contraseña tiene que ser distinta de la actual."
          : null;

  async function cambiar(e: React.FormEvent) {
    e.preventDefault();
    if (problema) return;
    setSaving(true);
    setMsg(null);
    const { error } = await authClient.changePassword({
      currentPassword: actual,
      newPassword: nueva,
      revokeOtherSessions: true,
    });
    setSaving(false);
    if (error) {
      setMsg({
        ok: false,
        text:
          error.status === 400 || error.status === 401
            ? "La contraseña actual no es correcta."
            : error.status === 429
              ? "Demasiados intentos. Espera unos minutos."
              : (error.message ?? "No se pudo cambiar la contraseña."),
      });
      return;
    }
    setActual("");
    setNueva("");
    setRepetida("");
    setMsg({ ok: true, text: "Contraseña cambiada ✓ Las demás sesiones abiertas se cerraron." });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Mi cuenta</h1>
        <p className="text-sm text-text-3">
          {name} · {email}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
          <CardDescription>Al cambiarla se cierran tus otras sesiones; esta sigue abierta.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={cambiar} className="max-w-sm space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw-actual">Contraseña actual</Label>
              <Input
                id="pw-actual"
                type="password"
                autoComplete="current-password"
                required
                value={actual}
                onChange={(e) => setActual(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-nueva">Contraseña nueva</Label>
              <Input
                id="pw-nueva"
                type="password"
                autoComplete="new-password"
                required
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-repetida">Repite la contraseña nueva</Label>
              <Input
                id="pw-repetida"
                type="password"
                autoComplete="new-password"
                required
                value={repetida}
                onChange={(e) => setRepetida(e.target.value)}
              />
            </div>
            {(problema || msg) && (
              <p className={`text-sm ${!problema && msg?.ok ? "text-success-text" : "text-destructive"}`}>
                {problema ?? msg?.text}
              </p>
            )}
            <Button type="submit" disabled={saving || Boolean(problema) || !actual || !nueva || !repetida}>
              {saving ? "Guardando…" : "Cambiar contraseña"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
