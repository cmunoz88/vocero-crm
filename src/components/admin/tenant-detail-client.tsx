"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, KeyRound, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TenantRow } from "@/components/admin/tenants-client";

type Member = { id: string; role: string; name: string; email: string; createdAt: string };
type Brain = {
  dispatchUrl: string | null;
  healthUrl: string | null;
  keyLast4: string | null;
  usaEntorno: boolean;
  config: { active: boolean; host: string | null; problem: string | null };
};
type Detalle = { tenant: TenantRow; members: Member[]; brain: Brain };

async function errorDe(res: Response | null, fallback: string): Promise<string> {
  const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? fallback;
}

function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export function TenantDetailClient({ id }: { id: string }) {
  const [d, setD] = useState<Detalle | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/admin/tenants/${id}`, { cache: "no-store" }).catch(() => null);
    if (res?.status === 404) return setNotFound(true);
    if (res?.ok) setD((await res.json()) as Detalle);
  }, [id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (notFound) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-text-3">Ese negocio no existe (o ya se borró).</p>
      </div>
    );
  }
  if (!d) return <p className="text-sm text-text-3">Cargando…</p>;
  const t = d.tenant;

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t.name}</h1>
        <Badge variant={t.status === "active" ? "success" : "warning"}>
          {t.status === "active" ? "Activo" : "Suspendido"}
        </Badge>
        {t.isPrimary && <Badge variant="secondary">Principal</Badge>}
        <a
          href={`/t/${t.slug ?? t.id}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 font-mono text-sm text-primary hover:underline"
        >
          /t/{t.slug ?? t.id}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <DatosCard tenant={t} onSaved={refetch} />
      <CerebroCard id={id} brain={d.brain} onChange={refetch} />
      <CuentasCard members={d.members} />
      <PeligroCard tenant={t} onChange={refetch} />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-text-2 hover:text-foreground">
      <ArrowLeft className="h-4 w-4" />
      Negocios
    </Link>
  );
}

function DatosCard({ tenant, onSaved }: { tenant: TenantRow; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const cambiado = name !== tenant.name || slug !== (tenant.slug ?? "");

  async function guardar() {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/admin/tenants/${tenant.id}`, json("PATCH", { name, slug })).catch(() => null);
    setSaving(false);
    if (!res?.ok) return setMsg({ ok: false, text: await errorDe(res, "No se pudo guardar") });
    setMsg({ ok: true, text: "Guardado ✓" });
    await onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos</CardTitle>
        <CardDescription>
          Si cambias el web ID, la entrada anterior deja de funcionar: avísale al dueño.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="d-name">Nombre</Label>
            <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-slug">Web ID</Label>
            <Input
              id="d-slug"
              className="font-mono"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
            />
          </div>
        </div>
        {msg && <p className={`text-sm ${msg.ok ? "text-success-text" : "text-destructive"}`}>{msg.text}</p>}
        <Button disabled={!cambiado || saving} onClick={() => void guardar()}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        <p className="text-xs text-text-3">
          WhatsApp, IA, marca, agente y equipo los configura el dueño desde Ajustes de su propio CRM.
        </p>
      </CardContent>
    </Card>
  );
}

const PROBLEMAS: Record<string, string> = {
  url: "La URL de despacho no es válida.",
  sin_llave: "Falta la llave del bot: genérala abajo.",
};

function CerebroCard({ id, brain, onChange }: { id: string; brain: Brain; onChange: () => Promise<void> }) {
  const [dispatchUrl, setDispatchUrl] = useState(brain.dispatchUrl ?? "");
  const [healthUrl, setHealthUrl] = useState(brain.healthUrl ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [llave, setLlave] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cambiado = dispatchUrl !== (brain.dispatchUrl ?? "") || healthUrl !== (brain.healthUrl ?? "");

  async function guardar() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/tenants/${id}/brain`, json("PUT", { dispatchUrl, healthUrl })).catch(
      () => null
    );
    setBusy(false);
    if (!res?.ok) return setMsg({ ok: false, text: await errorDe(res, "No se pudo guardar") });
    setMsg({ ok: true, text: "Guardado ✓" });
    await onChange();
  }

  async function generar() {
    if (brain.keyLast4 && !confirm("La llave actual deja de funcionar en cuanto generes otra. ¿Seguir?")) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/tenants/${id}/brain/key`, json("POST")).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setMsg({ ok: false, text: await errorDe(res, "No se pudo generar la llave") });
    setLlave(((await res.json()) as { key: string }).key);
    await onChange();
  }

  async function revocar() {
    if (!confirm("El cerebro de este negocio dejará de poder contestar. ¿Revocar la llave?")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/tenants/${id}/brain/key`, json("DELETE")).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setMsg({ ok: false, text: await errorDe(res, "No se pudo revocar") });
    setLlave(null);
    await onChange();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Cerebro
          <Badge variant={brain.config.active ? "success" : "secondary"}>
            {brain.config.active ? `Despachando a ${brain.config.host}` : "Bandeja manual"}
          </Badge>
        </CardTitle>
        <CardDescription>
          El agente que contesta por este negocio (Nea u otro). Con la URL y la llave, el CRM le despacha cada
          ráfaga y el cerebro contesta por <code>/api/bot/*</code> con su llave. El dueño todavía tiene que encender
          el Agente desde su CRM.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {brain.usaEntorno && (
          <p className="rounded-md border bg-subtle p-3 text-xs text-text-2">
            Es el negocio principal y no tiene configuración propia: usa <code>BRAIN_DISPATCH_URL</code> y{" "}
            <code>BOT_API_KEY</code> del entorno. Si guardas algo aquí, eso reemplaza al entorno.
          </p>
        )}
        {!brain.config.active && brain.config.problem && (
          <p className="text-sm text-warning-text">{PROBLEMAS[brain.config.problem] ?? brain.config.problem}</p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="b-dispatch">URL de despacho</Label>
            <Input
              id="b-dispatch"
              className="font-mono"
              value={dispatchUrl}
              onChange={(e) => setDispatchUrl(e.target.value)}
              placeholder="http://nea:8000/vocero/dispatch"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-health">URL de salud (opcional)</Label>
            <Input
              id="b-health"
              className="font-mono"
              value={healthUrl}
              onChange={(e) => setHealthUrl(e.target.value)}
              placeholder="por defecto, /health del mismo origen"
            />
          </div>
        </div>
        <Button variant="outline" disabled={!cambiado || busy} onClick={() => void guardar()}>
          Guardar URLs
        </Button>

        <div className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <KeyRound className="h-4 w-4 text-text-3" />
            <span className="text-sm">
              Llave del bot:{" "}
              {brain.keyLast4 ? <code>••••{brain.keyLast4}</code> : <span className="text-text-3">sin llave</span>}
            </span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => void generar()}>
                {brain.keyLast4 ? "Rotar llave" : "Generar llave"}
              </Button>
              {brain.keyLast4 && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void revocar()}>
                  Revocar
                </Button>
              )}
            </div>
          </div>
          {llave && (
            <div className="rounded-md border border-success-soft bg-success-tint p-3 text-sm text-success-text">
              <p className="font-medium">Copia la llave ahora: no se vuelve a mostrar.</p>
              <code className="mt-1 block break-all">{llave}</code>
              <p className="mt-1 text-xs opacity-90">
                Ponla en el cerebro de este negocio como su <code>VOCERO_API_KEY</code> (o como se llame ahí).
              </p>
            </div>
          )}
        </div>
        {msg && <p className={`text-sm ${msg.ok ? "text-success-text" : "text-destructive"}`}>{msg.text}</p>}
      </CardContent>
    </Card>
  );
}

function CuentasCard({ members }: { members: Member[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuentas</CardTitle>
        <CardDescription>El dueño crea más cuentas desde Ajustes → Equipo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {members.length === 0 && <p className="text-sm text-text-3">Sin cuentas.</p>}
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <p className="truncate text-xs text-text-3">{m.email}</p>
            </div>
            <Badge variant={m.role === "owner" ? "default" : "secondary"}>
              {m.role === "owner" ? "Dueño" : "Equipo"}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PeligroCard({ tenant, onChange }: { tenant: TenantRow; onChange: () => Promise<void> }) {
  const router = useRouter();
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const webId = tenant.slug ?? tenant.id;
  const suspendido = tenant.status === "suspended";

  async function cambiarEstado() {
    if (!suspendido && !confirm(`¿Suspender ${tenant.name}? Nadie podrá entrar y no recibirá WhatsApp.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/admin/tenants/${tenant.id}`,
      json("PATCH", { status: suspendido ? "active" : "suspended" })
    ).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(await errorDe(res, "No se pudo cambiar el estado"));
    await onChange();
  }

  async function borrar() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/tenants/${tenant.id}`, json("DELETE", { confirm: confirmacion })).catch(
      () => null
    );
    setBusy(false);
    if (!res?.ok) return setError(await errorDe(res, "No se pudo borrar"));
    router.push("/admin");
    router.refresh();
  }

  return (
    <Card className="border-danger-soft">
      <CardHeader>
        <CardTitle>Zona de peligro</CardTitle>
        <CardDescription>
          Suspender es reversible: el negocio no entra, no recibe WhatsApp y su cerebro no contesta. Borrar es
          definitivo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Button variant={suspendido ? "default" : "outline"} disabled={busy} onClick={() => void cambiarEstado()}>
          {suspendido ? "Reactivar negocio" : "Suspender negocio"}
        </Button>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Borrar definitivamente</p>
          {suspendido ? (
            <>
              <p className="text-sm text-text-2">
                Borra contactos, conversaciones, mensajes, archivos, configuración y las cuentas de este negocio. No
                se puede deshacer. Escribe <code className="font-semibold">{webId}</code> para confirmar.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label="Confirmar web ID"
                  className="max-w-xs font-mono"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  placeholder={webId}
                />
                <Button
                  variant="destructive"
                  disabled={busy || confirmacion.trim().toLowerCase() !== webId}
                  onClick={() => void borrar()}
                >
                  <Trash2 className="h-4 w-4" />
                  Borrar para siempre
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-text-3">Primero suspende el negocio.</p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
