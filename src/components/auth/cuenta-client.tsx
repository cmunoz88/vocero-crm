"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** 067/068 — Mis datos (usuario, nombre y correo) y mi contraseña. */
export function CuentaClient({
  name,
  email,
  username,
  emailVerificado,
  correoDisponible,
}: {
  name: string;
  email: string;
  username: string;
  emailVerificado: boolean;
  correoDisponible: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Mi cuenta</h1>
        <p className="text-sm text-text-3">
          {username ? `@${username} · ` : ""}
          {name} · {email}
        </p>
      </div>
      <UsuarioCard username={username} />
      <NombreCard name={name} />
      <CorreoCard email={email} verificado={emailVerificado} correoDisponible={correoDisponible} />
      <PasswordCard />
    </div>
  );
}

function Aviso({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={`text-sm ${msg.ok ? "text-success-text" : "text-destructive"}`}>{msg.text}</p>;
}

function UsuarioCard({ username }: { username: string }) {
  const router = useRouter();
  const [valor, setValor] = useState(username);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const limpio = valor.trim();

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const { error } = await authClient.updateUser({ username: limpio, displayUsername: limpio });
    setSaving(false);
    if (error) {
      return setMsg({
        ok: false,
        text: /taken|exist/i.test(error.message ?? "")
          ? "Ese usuario ya lo usa otra cuenta."
          : "Usuario inválido: 3 a 30 letras, números, _ o punto.",
      });
    }
    setMsg({ ok: true, text: `Usuario guardado ✓ Desde ahora entras con «${limpio}».` });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usuario</CardTitle>
        <CardDescription>Con él entras (no distingue mayúsculas).</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={guardar} className="max-w-sm space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cuenta-usuario">Usuario</Label>
            <Input
              id="cuenta-usuario"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={30}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <Aviso msg={msg} />
          <Button type="submit" disabled={saving || !limpio || limpio === username}>
            {saving ? "Guardando…" : "Guardar usuario"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function NombreCard({ name }: { name: string }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(name);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const limpio = nombre.trim();

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const { error } = await authClient.updateUser({ name: limpio });
    setSaving(false);
    if (error) return setMsg({ ok: false, text: error.message ?? "No se pudo guardar el nombre." });
    setMsg({ ok: true, text: "Nombre guardado ✓" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nombre</CardTitle>
        <CardDescription>Así te ve tu equipo en el CRM.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={guardar} className="max-w-sm space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cuenta-nombre">Nombre</Label>
            <Input
              id="cuenta-nombre"
              autoComplete="name"
              maxLength={120}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <Aviso msg={msg} />
          <Button type="submit" disabled={saving || !limpio || limpio === name}>
            {saving ? "Guardando…" : "Guardar nombre"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CorreoCard({
  email,
  verificado,
  correoDisponible,
}: {
  email: string;
  verificado: boolean;
  correoDisponible: boolean;
}) {
  const router = useRouter();
  const [verif, setVerif] = useState<{ ok: boolean; text: string } | null>(null);

  async function verificar() {
    setVerif(null);
    const res = await fetch("/api/cuenta/verificar-correo", { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
    setVerif(
      res?.ok
        ? { ok: true, text: `Te mandamos un enlace a ${email}. Ábrelo para confirmar.` }
        : { ok: false, text: data?.error?.message ?? "No se pudo enviar." }
    );
  }
  const [nuevo, setNuevo] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function cambiar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/cuenta/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: nuevo, password }),
    }).catch(() => null);
    setSaving(false);
    const data = (await res?.json().catch(() => null)) as { error?: { message?: string }; email?: string } | null;
    if (!res?.ok) return setMsg({ ok: false, text: data?.error?.message ?? "No se pudo cambiar el correo." });
    setNuevo("");
    setPassword("");
    setMsg({ ok: true, text: `Correo cambiado ✓ Ahora es ${data?.email ?? nuevo}; verifícalo para poder recuperar tu contraseña.` });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Correo</CardTitle>
        <CardDescription>
          Para recuperar tu contraseña. Ahora: <code>{email}</code>{" "}
          {verificado ? (
            <span className="text-success-text">· verificado ✓</span>
          ) : (
            <span className="text-destructive">· sin verificar</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!verificado && (
          <div className="mb-5 space-y-2 rounded-lg border p-3 text-sm">
            <p>Sin verificarlo no podrás recuperar tu contraseña por correo.</p>
            {correoDisponible ? (
              <Button type="button" variant="outline" size="sm" onClick={verificar}>
                Enviarme el enlace de verificación
              </Button>
            ) : (
              <p className="text-muted-foreground">Esta instalación todavía no envía correos.</p>
            )}
            <Aviso msg={verif} />
          </div>
        )}
        <form onSubmit={cambiar} className="max-w-sm space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cuenta-correo">Correo nuevo</Label>
            <Input
              id="cuenta-correo"
              type="email"
              autoComplete="email"
              required
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cuenta-correo-pw">Tu contraseña (para confirmar)</Label>
            <Input
              id="cuenta-correo-pw"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Aviso msg={msg} />
          <Button type="submit" disabled={saving || !nuevo.trim() || !password}>
            {saving ? "Cambiando…" : "Cambiar correo"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
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
  );
}
