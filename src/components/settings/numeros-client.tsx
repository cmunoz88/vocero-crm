"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Numero = {
  id: string;
  label: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: "connected" | "reconnect_required";
  isPrimary: boolean;
  agentProfileId: string | null;
  tokenLast4: string;
};
type Agente = { id: string; name: string; enabled: boolean; isDefault: boolean; instructions: string | null };
type Modo = "compartido" | "por_numero";

async function enviar(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (res?.ok) return null;
  const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? "No se pudo guardar";
}

/**
 * 068 — Varios números de WhatsApp por negocio y varios agentes. El número
 * principal se conecta en Ajustes → WhatsApp; aquí se agregan los demás y se
 * decide quién contesta cada uno.
 */
export function NumerosClient() {
  const [numeros, setNumeros] = useState<Numero[]>([]);
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [modo, setModo] = useState<Modo>("compartido");
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ label: "", wabaId: "", phoneNumberId: "", token: "" });
  const [abierto, setAbierto] = useState(false);
  const [nombreAgente, setNombreAgente] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const [n, a] = await Promise.all([
      fetch("/api/settings/numbers").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/agents").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (n) setNumeros(n.numeros);
    if (a) {
      setAgentes(a.agentes);
      setModo(a.modo);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function accion(url: string, method: string, body?: unknown) {
    setError(null);
    const e = await enviar(url, method, body);
    if (e) setError(e);
    await cargar();
    return !e;
  }

  async function agregarNumero() {
    setGuardando(true);
    const ok = await accion("/api/settings/numbers", "POST", nuevo);
    setGuardando(false);
    if (ok) {
      setNuevo({ label: "", wabaId: "", phoneNumberId: "", token: "" });
      setAbierto(false);
    }
  }

  async function crearAgente() {
    if (!nombreAgente.trim()) return;
    if (await accion("/api/agents", "POST", { name: nombreAgente })) setNombreAgente("");
  }

  return (
    <div className="max-w-3xl space-y-6">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Números de WhatsApp</CardTitle>
            <CardDescription>
              Cada conversación se contesta desde el número al que escribió el cliente.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setAbierto((v) => !v)}>
            <Plus className="size-4" /> Agregar número
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {abierto && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="num-label">Nombre (Ventas, Soporte…)</Label>
                  <Input id="num-label" value={nuevo.label} onChange={(e) => setNuevo({ ...nuevo, label: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="num-waba">ID de la cuenta de WhatsApp (WABA)</Label>
                  <Input id="num-waba" value={nuevo.wabaId} onChange={(e) => setNuevo({ ...nuevo, wabaId: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="num-phone">ID del número de teléfono</Label>
                  <Input id="num-phone" value={nuevo.phoneNumberId} onChange={(e) => setNuevo({ ...nuevo, phoneNumberId: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="num-token">Token de acceso</Label>
                  <Input id="num-token" type="password" autoComplete="off" value={nuevo.token} onChange={(e) => setNuevo({ ...nuevo, token: e.target.value })} />
                </div>
              </div>
              <Button onClick={agregarNumero} disabled={guardando || !nuevo.wabaId || !nuevo.phoneNumberId || !nuevo.token}>
                {guardando ? "Verificando…" : "Verificar y agregar"}
              </Button>
            </div>
          )}
          {numeros.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aún no hay números. Conecta el principal en Ajustes → WhatsApp.
            </p>
          )}
          {numeros.map((n) => (
            <div key={n.id} data-testid="numero" className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {n.label || n.verifiedName || "Número"}
                  {n.isPrimary && <Badge variant="secondary">Principal</Badge>}
                  {n.status === "reconnect_required" && <Badge variant="destructive">Reconectar</Badge>}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {n.displayPhoneNumber ?? n.phoneNumberId} · token …{n.tokenLast4}
                </p>
              </div>
              {modo === "por_numero" && (
                <select
                  aria-label={`Agente de ${n.label || n.displayPhoneNumber || "este número"}`}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={n.agentProfileId ?? ""}
                  onChange={(e) => void accion(`/api/settings/numbers/${n.id}`, "PATCH", { agentProfileId: e.target.value || null })}
                >
                  <option value="">Agente principal</option>
                  {agentes.filter((a) => !a.isDefault).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
              {!n.isPrimary && (
                <Button variant="ghost" size="sm" onClick={() => void accion(`/api/settings/numbers/${n.id}`, "PATCH", { isPrimary: true })}>
                  <Star className="size-4" /> Hacer principal
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-label="Quitar número"
                onClick={() => {
                  if (confirm("¿Quitar este número? Sus conversaciones se quedan en la bandeja.")) {
                    void accion(`/api/settings/numbers/${n.id}`, "DELETE");
                  }
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agentes</CardTitle>
          <CardDescription>
            El agente principal es el interruptor de la IA de todo el negocio. Puedes tener
            otros y asignarlos por número.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="sr-only">Quién contesta</legend>
            {(
              [
                ["compartido", "Un agente para todos los números"],
                ["por_numero", "Un agente por número"],
              ] as const
            ).map(([valor, texto]) => (
              <label key={valor} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="modo"
                  value={valor}
                  checked={modo === valor}
                  onChange={() => void accion("/api/agents", "PATCH", { modo: valor })}
                />
                {texto}
              </label>
            ))}
          </fieldset>
          <ul className="space-y-2">
            {agentes.map((a) => (
              <li key={a.id} data-testid="agente" className="flex items-center gap-3 rounded-lg border p-3">
                <span className="flex-1 font-medium">{a.name}</span>
                {a.isDefault ? (
                  <Badge variant="secondary">Principal</Badge>
                ) : (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        onChange={(e) => void accion(`/api/agents/${a.id}`, "PATCH", { enabled: e.target.checked })}
                      />
                      Activo
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Borrar ${a.name}`}
                      onClick={() => {
                        if (confirm(`¿Borrar a ${a.name}? Sus números pasan al agente principal.`)) {
                          void accion(`/api/agents/${a.id}`, "DELETE");
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              id="agente-nombre"
              placeholder="Nombre del nuevo agente"
              value={nombreAgente}
              onChange={(e) => setNombreAgente(e.target.value)}
            />
            <Button variant="outline" onClick={crearAgente} disabled={!nombreAgente.trim()}>
              Crear agente
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
