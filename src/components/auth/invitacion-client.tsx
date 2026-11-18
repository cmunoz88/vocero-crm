"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function leerError(res: Response | null, fallback: string): Promise<string> {
  const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? fallback;
}

export function InvitacionInvalida({ verificacion = false }: { verificacion?: boolean }) {
  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>{verificacion ? "Este enlace ya no sirve" : "Invitación no válida"}</CardTitle>
        <CardDescription>
          {verificacion
            ? "El enlace de verificación venció o ya se usó. Vuelve a abrir tu invitación para pedir otro."
            : "La invitación venció, ya se usó o se revocó. Pídele una nueva a quien te la envió."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Ir a entrar
        </Link>
      </CardContent>
    </Card>
  );
}

/** Paso 1: nombre del negocio y correo del responsable. */
export function SolicitarForm({
  token,
  negocio: negocioInicial,
  email: emailInicial,
  esperando,
}: {
  token: string;
  negocio: string;
  email: string;
  esperando: boolean;
}) {
  const [negocio, setNegocio] = useState(negocioInicial);
  const [email, setEmail] = useState(emailInicial);
  const [enviadoA, setEnviadoA] = useState<{ email: string; enviado: boolean } | null>(
    esperando && emailInicial ? { email: emailInicial, enviado: true } : null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/invitacion/${encodeURIComponent(token)}/solicitar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ negocio, email }),
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) return setError(await leerError(res, "No se pudo enviar. Intenta de nuevo."));
    const data = (await res.json()) as { enviado: boolean };
    setEnviadoA({ email: email.trim().toLowerCase(), enviado: data.enviado });
  }

  if (enviadoA) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Revisa tu correo</CardTitle>
          <CardDescription>
            {enviadoA.enviado
              ? `Te mandamos un enlace a ${enviadoA.email} para confirmar que es tuyo. Vence en 24 horas.`
              : `Esta plataforma todavía no envía correos: pídele a quien te invitó el enlace para confirmar ${enviadoA.email}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button type="button" onClick={() => setEnviadoA(null)} className="text-sm text-primary hover:underline">
            Cambiar los datos o reenviar
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>Registra tu negocio</CardTitle>
        <CardDescription>Te invitaron a tener tu propio CRM de WhatsApp. Empecemos por lo básico.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-negocio">Nombre del negocio</Label>
            <Input id="inv-negocio" required maxLength={120} value={negocio} onChange={(e) => setNegocio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">Tu correo (el del responsable)</Label>
            <Input id="inv-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || negocio.trim().length < 2 || !email.trim()}>
            {loading ? "Enviando…" : "Verificar mi correo"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Paso 3: usuario y contraseña → se crea todo y entra. */
export function CompletarForm({
  token,
  codigo,
  negocio,
  email,
}: {
  token: string;
  codigo: string;
  negocio: string;
  email: string;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const problema =
    username && !/^[a-zA-Z0-9_.]{3,30}$/.test(username.trim())
      ? "Usuario: 3 a 30 letras, números, _ o punto."
      : password && password.length < 8
        ? "La contraseña necesita al menos 8 caracteres."
        : repetida && password !== repetida
          ? "Las contraseñas no coinciden."
          : null;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (problema) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/invitacion/${encodeURIComponent(token)}/completar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ codigo, nombre, username: username.trim(), password }),
    }).catch(() => null);
    if (!res?.ok) {
      setLoading(false);
      return setError(await leerError(res, "No se pudo crear la cuenta."));
    }
    const { error: err } = await authClient.signIn.username({ username: username.trim(), password });
    if (err) {
      setLoading(false);
      router.push("/login");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>Correo confirmado ✓</CardTitle>
        <CardDescription>
          Último paso para crear «{negocio}». Con tu usuario entras; {email} queda para recuperar tu contraseña.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={crear} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-nombre">Tu nombre</Label>
            <Input id="inv-nombre" autoComplete="name" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-usuario">Usuario</Label>
            <Input
              id="inv-usuario"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-pass">Contraseña</Label>
            <Input id="inv-pass" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-pass2">Repítela</Label>
            <Input id="inv-pass2" type="password" autoComplete="new-password" required value={repetida} onChange={(e) => setRepetida(e.target.value)} />
          </div>
          {(problema || error) && <p className="text-sm text-destructive">{problema ?? error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || Boolean(problema) || !nombre.trim() || !username.trim() || !password || !repetida}
          >
            {loading ? "Creando tu negocio…" : "Crear mi negocio"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
