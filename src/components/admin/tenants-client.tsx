"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sugerirSlug, validarSlug } from "@/lib/tenant-slug";

export type TenantRow = {
  id: string;
  name: string;
  slug: string | null;
  status: "active" | "suspended";
  suspendedAt: string | null;
  createdAt: string;
  members: number;
  whatsapp: { connected: boolean; phone: string | null };
  isPrimary: boolean;
};

export function generarPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function errorDe(res: Response | null, fallback: string): Promise<string> {
  const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? fallback;
}

export function TenantsClient() {
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/admin/tenants", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setLoadError(await errorDe(res, "No se pudo cargar la lista de negocios"));
      return;
    }
    setLoadError(null);
    setTenants(((await res.json()) as { tenants: TenantRow[] }).tenants);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const activos = tenants?.filter((t) => t.status === "active").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Negocios</h1>
          <p className="text-sm text-text-3">
            {tenants
              ? `${tenants.length} en la plataforma · ${activos} activos`
              : "Cargando…"}
          </p>
        </div>
        {!abierto && (
          <Button onClick={() => setAbierto(true)}>
            <Plus className="h-4 w-4" />
            Nuevo negocio
          </Button>
        )}
      </div>

      {abierto && (
        <AltaTenant
          onCancel={() => setAbierto(false)}
          onCreated={() => void refetch()}
        />
      )}

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      <div className="overflow-hidden rounded-lg border bg-card">
        {tenants?.length === 0 && (
          <p className="p-6 text-sm text-text-3">Todavía no hay negocios.</p>
        )}
        {tenants?.map((t, i) => (
          <Link
            key={t.id}
            href={`/admin/${t.id}`}
            className={`flex items-center gap-4 px-4 py-3 hover:bg-accent ${i > 0 ? "border-t" : ""}`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-text-2">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-semibold">
                {t.name}
                {t.isPrimary && <Badge variant="secondary">Principal</Badge>}
              </p>
              <p className="truncate font-mono text-xs text-text-3">/t/{t.slug ?? t.id}</p>
            </div>
            <div className="hidden text-right text-xs text-text-3 sm:block">
              <p>{t.whatsapp.connected ? (t.whatsapp.phone ?? "WhatsApp conectado") : "Sin WhatsApp"}</p>
              <p>
                {t.members} {t.members === 1 ? "cuenta" : "cuentas"}
              </p>
            </div>
            <Badge variant={t.status === "active" ? "success" : "warning"}>
              {t.status === "active" ? "Activo" : "Suspendido"}
            </Badge>
            <ChevronRight className="h-4 w-4 text-text-3" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function AltaTenant({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTocado, setSlugTocado] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerUser, setOwnerUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creado, setCreado] = useState<{ slug: string; username: string; password: string } | null>(null);

  const slugEfectivo = slugTocado ? slug : sugerirSlug(name);
  const slugOk = slugEfectivo ? validarSlug(slugEfectivo) : null;

  async function crear() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        slug: slugEfectivo,
        owner: { name: ownerName, email: ownerEmail, username: ownerUser.trim(), password },
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError(await errorDe(res, "No se pudo crear el negocio"));
      return;
    }
    const data = (await res.json()) as { slug: string };
    setCreado({ slug: data.slug, username: ownerUser.trim(), password });
    onCreated();
  }

  if (creado) {
    const url = `${window.location.origin}/t/${creado.slug}`;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Negocio creado ✓</CardTitle>
          <CardDescription>
            Comparte estos datos con el dueño ahora: la contraseña no se vuelve a mostrar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid gap-2 rounded-md border bg-subtle p-3 sm:grid-cols-[120px_1fr]">
            <dt className="text-text-3">Entrada</dt>
            <dd className="break-all font-mono">{url}</dd>
            <dt className="text-text-3">Usuario</dt>
            <dd className="font-mono">{creado.username}</dd>
            <dt className="text-text-3">Contraseña</dt>
            <dd className="font-mono">{creado.password}</dd>
          </dl>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard?.writeText(
                  `Entrada: ${url}\nUsuario: ${creado.username}\nContraseña temporal: ${creado.password}`
                )
              }
            >
              Copiar datos
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cerrar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Nuevo negocio</CardTitle>
          <CardDescription>
            Cada negocio tiene sus propios datos, su WhatsApp, su IA, su marca y su cerebro.
          </CardDescription>
        </div>
        <button onClick={onCancel} aria-label="Cancelar" className="rounded-md p-1 text-text-3 hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Nombre del negocio</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Panadería Lupita" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-slug">Web ID</Label>
            <div className="flex items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
              <span className="pl-3 font-mono text-sm text-text-3">/t/</span>
              <input
                id="t-slug"
                value={slugEfectivo}
                onChange={(e) => {
                  setSlugTocado(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                className="h-9 min-w-0 flex-1 bg-transparent pr-3 font-mono text-sm outline-none"
                placeholder="panaderia-lupita"
              />
            </div>
            {slugOk && !slugOk.ok && (
              <p className="text-xs text-destructive">
                {slugOk.motivo === "reservado"
                  ? "Ese web ID está reservado."
                  : "Minúsculas, números y guiones; de 3 a 40 caracteres."}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-3 border-t pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-text-3">Cuenta del dueño</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="o-name">Nombre</Label>
              <Input id="o-name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-email">Correo (recuperación)</Label>
              <Input id="o-email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="o-user">Usuario (con él entra)</Label>
            <Input
              id="o-user"
              autoCapitalize="none"
              spellCheck={false}
              value={ownerUser}
              onChange={(e) => setOwnerUser(e.target.value)}
              placeholder="lupita"
            />
            {ownerUser && !/^[a-zA-Z0-9_.]{3,30}$/.test(ownerUser.trim()) && (
              <p className="text-xs text-destructive">3 a 30: letras, números, _ y punto.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="o-pass">Contraseña temporal</Label>
            <div className="flex gap-2">
              <Input
                id="o-pass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="mínimo 8 caracteres"
              />
              <Button variant="outline" onClick={() => setPassword(generarPassword())}>
                Generar
              </Button>
            </div>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          disabled={
            saving ||
            !name.trim() ||
            !slugOk?.ok ||
            !ownerName.trim() ||
            !ownerEmail.trim() ||
            !/^[a-zA-Z0-9_.]{3,30}$/.test(ownerUser.trim()) ||
            password.length < 8
          }
          onClick={() => void crear()}
        >
          {saving ? "Creando…" : "Crear negocio"}
        </Button>
      </CardContent>
    </Card>
  );
}
