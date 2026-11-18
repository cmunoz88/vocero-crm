"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Mail, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Inv = {
  id: string;
  note: string | null;
  status: "pendiente" | "verificando" | "verificada" | "consumiendo" | "usada" | "revocada" | "vencida";
  businessName: string | null;
  email: string | null;
  organizationId: string | null;
  expiresAt: string;
  createdAt: string;
};

const ETIQUETA: Record<Inv["status"], string> = {
  pendiente: "Sin abrir",
  verificando: "Verificando correo",
  verificada: "Correo verificado",
  consumiendo: "Creando…",
  usada: "Registrado",
  revocada: "Revocada",
  vencida: "Vencida",
};

async function errorDe(res: Response | null, fallback: string): Promise<string> {
  const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? fallback;
}

/** 068 — «Invitar negocio»: el cliente registra su negocio con un enlace de un solo uso. */
export function InvitacionesClient() {
  const [lista, setLista] = useState<Inv[] | null>(null);
  const [nota, setNota] = useState("");
  const [nueva, setNueva] = useState<{ url: string; expiresAt: string } | null>(null);
  const [manual, setManual] = useState<{ id: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/admin/invitaciones", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setLista(((await res.json()) as { invitaciones: Inv[] }).invitaciones);
  }, []);
  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function invitar() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/invitaciones", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: nota || undefined }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) return setError(await errorDe(res, "No se pudo crear la invitación."));
    setNueva((await res.json()) as { url: string; expiresAt: string });
    setNota("");
    await refetch();
  }

  async function revocar(id: string) {
    if (!window.confirm("¿Revocar esta invitación? El enlace dejará de servir.")) return;
    const res = await fetch(`/api/admin/invitaciones/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setError(await errorDe(res, "No se pudo revocar."));
    await refetch();
  }

  async function enlaceManual(id: string) {
    const res = await fetch(`/api/admin/invitaciones/${id}/verificacion`, { method: "POST" }).catch(() => null);
    if (!res?.ok) return setError(await errorDe(res, "No se pudo generar."));
    setManual({ id, url: ((await res.json()) as { url: string }).url });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Invitaciones</CardTitle>
          <CardDescription>
            Genera un enlace y envíaselo al cliente: él pone el nombre de su negocio, verifica su correo y elige su usuario.
          </CardDescription>
        </div>
        {!abierto && (
          <Button onClick={() => setAbierto(true)}>
            <Send className="h-4 w-4" />
            Invitar negocio
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {abierto && (
          <div className="space-y-3 rounded-lg border p-3">
            {nueva ? (
              <>
                <p className="text-sm font-medium">Enlace listo ✓ Cópialo ahora: no se vuelve a mostrar.</p>
                <p className="break-all rounded-md bg-subtle p-2 font-mono text-xs" data-testid="enlace-invitacion">
                  {nueva.url}
                </p>
                <p className="text-xs text-text-3">
                  Un solo uso · vence el {new Date(nueva.expiresAt).toLocaleDateString()}.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(nueva.url)}>
                    Copiar enlace
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setNueva(null);
                      setAbierto(false);
                    }}
                  >
                    Listo
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-nota">Nota para ti (opcional)</Label>
                  <Input id="inv-nota" maxLength={120} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Panadería de Lupita" />
                </div>
                <div className="flex gap-2">
                  <Button disabled={saving} onClick={() => void invitar()}>
                    {saving ? "Generando…" : "Generar enlace"}
                  </Button>
                  <Button variant="ghost" onClick={() => setAbierto(false)}>
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {lista?.length === 0 && <p className="text-sm text-text-3">Aún no hay invitaciones.</p>}
        <div className="space-y-2">
          {lista?.map((i) => (
            <div key={i.id} className="space-y-2 rounded-md border px-3 py-2" data-testid={`invitacion-${i.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{i.businessName ?? i.note ?? "Invitación"}</span>
                <Badge variant={i.status === "usada" ? "default" : "secondary"}>{ETIQUETA[i.status]}</Badge>
                {i.email && <span className="text-xs text-text-3">{i.email}</span>}
                <div className="ml-auto flex gap-1">
                  {i.status === "usada" && i.organizationId && (
                    <Link href={`/admin/${i.organizationId}`} className="text-xs text-primary hover:underline">
                      Ver negocio
                    </Link>
                  )}
                  {i.status === "verificando" && (
                    <Button size="sm" variant="outline" onClick={() => void enlaceManual(i.id)} title="Si no le llega el correo">
                      <Mail className="h-4 w-4" />
                      Enlace de verificación
                    </Button>
                  )}
                  {["pendiente", "verificando", "verificada"].includes(i.status) && (
                    <Button size="sm" variant="ghost" onClick={() => void revocar(i.id)}>
                      Revocar
                    </Button>
                  )}
                </div>
              </div>
              {manual?.id === i.id && (
                <div className="space-y-1 rounded-md bg-subtle p-2 text-xs">
                  <p>Entrégaselo al cliente (el enlace de invitación anterior deja de servir):</p>
                  <p className="break-all font-mono">{manual.url}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
