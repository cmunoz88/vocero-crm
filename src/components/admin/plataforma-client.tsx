"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Plataforma = {
  totales: { negocios: number; activos: number; conIa: number; numeros: number; conversaciones: number; mensajes30d: number };
  integraciones: {
    correo: { habilitado: boolean; remitente: string | null };
    ia: { bloqueada: boolean; configurada: boolean; last4: string | null; modelo: string | null };
    cerebro: { activo: boolean; host: string | null } | null;
  };
  modelos: string[];
};

/** 068 · etapa 4 — Panel global del superadministrador. */
export function PlataformaClient() {
  const [d, setD] = useState<Plataforma | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/admin/plataforma").catch(() => null);
    if (res?.ok) setD((await res.json()) as Plataforma);
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar(modelos: string[]) {
    setError(null);
    const res = await fetch("/api/admin/plataforma", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modelos }),
    }).catch(() => null);
    if (!res?.ok) {
      const j = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(j?.error?.message ?? "No se pudo guardar");
      return false;
    }
    await cargar();
    return true;
  }

  if (!d) return null;
  const t = d.totales;
  const ia = d.integraciones.ia;
  const cifras: [string, number][] = [
    ["Negocios activos", t.activos],
    ["Con IA encendida", t.conIa],
    ["Números de WhatsApp", t.numeros],
    ["Conversaciones", t.conversaciones],
    ["Mensajes (30 días)", t.mensajes30d],
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="totales">
        {cifras.map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-surface p-3">
            <p className="text-2xl font-bold tabular-nums">{v}</p>
            <p className="text-xs text-text-3">{k}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integraciones</CardTitle>
          <CardDescription>Lo que la plataforma comparte con todos los negocios.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className="w-28 font-medium">IA</span>
            <Badge variant={ia.configurada ? "success" : "secondary"}>
              {ia.configurada ? `OpenRouter ••••${ia.last4}` : "Sin llave"}
            </Badge>
            {ia.bloqueada && <Badge variant="secondary">Llave fija para todos</Badge>}
            {ia.modelo && <code className="text-xs">{ia.modelo}</code>}
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <span className="w-28 font-medium">Correo</span>
            <Badge variant={d.integraciones.correo.habilitado ? "success" : "secondary"}>
              {d.integraciones.correo.habilitado ? d.integraciones.correo.remitente ?? "SMTP" : "Sin configurar"}
            </Badge>
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <span className="w-28 font-medium">Cerebro</span>
            <Badge variant={d.integraciones.cerebro?.activo ? "success" : "secondary"}>
              {d.integraciones.cerebro?.activo ? d.integraciones.cerebro.host : "Sin conectar"}
            </Badge>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modelos autorizados</CardTitle>
          <CardDescription>
            Cada agente elige uno de esta lista. El de la plataforma
            {ia.modelo ? <> (<code>{ia.modelo}</code>)</> : null} siempre está disponible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="flex flex-wrap gap-2" data-testid="modelos">
            {d.modelos.length === 0 && <li className="text-sm text-text-3">Solo el de la plataforma.</li>}
            {d.modelos.map((m) => (
              <li key={m} className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs">
                <code>{m}</code>
                <button
                  type="button"
                  aria-label={`Quitar ${m}`}
                  className="ml-1 text-text-3 hover:text-destructive"
                  onClick={() => void guardar(d.modelos.filter((x) => x !== m))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              id="modelo-nuevo"
              placeholder="anthropic/claude-haiku-4.5"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={!nuevo.trim()}
              onClick={async () => {
                if (await guardar([...d.modelos, nuevo.trim()])) setNuevo("");
              }}
            >
              Autorizar
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
