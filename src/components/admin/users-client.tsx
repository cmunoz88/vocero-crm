"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type UserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  username: string | null;
  platformRole: "superadmin" | null;
  createdAt: string;
  negocios: { organizationId: string; name: string; slug: string | null; role: string }[];
};

async function errorDe(res: Response | null, fallback: string): Promise<string> {
  const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
  return data?.error?.message ?? fallback;
}

/** 068 — Todas las cuentas de la plataforma: borrar y enlace de restablecimiento. */
export function UsersClient() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enlace, setEnlace] = useState<{ id: string; url: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setError(await errorDe(res, "No se pudo cargar la lista."));
    setUsers(((await res.json()) as { users: UserRow[] }).users);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function borrar(u: UserRow) {
    if (!window.confirm(`¿Borrar para siempre la cuenta «${u.username ?? u.email}»? No se puede deshacer.`)) return;
    setOcupado(u.id);
    setError(null);
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" }).catch(() => null);
    setOcupado(null);
    if (!res?.ok) return setError(await errorDe(res, "No se pudo borrar."));
    await refetch();
  }

  async function generarEnlace(u: UserRow) {
    setOcupado(u.id);
    setError(null);
    const res = await fetch(`/api/admin/users/${u.id}/reset-link`, { method: "POST" }).catch(() => null);
    setOcupado(null);
    if (!res?.ok) return setError(await errorDe(res, "No se pudo generar el enlace."));
    setEnlace({ id: u.id, url: ((await res.json()) as { url: string }).url });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Usuarios</h1>
        <p className="text-sm text-text-3">
          Todas las cuentas de la plataforma. Cada quien entra con su usuario; el correo es para recuperar la contraseña.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!users && !error && <p className="text-sm text-text-3">Cargando…</p>}
      <div className="space-y-2">
        {users?.map((u) => (
          <Card key={u.id} data-testid={`usuario-${u.username ?? u.id}`}>
            <CardContent className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium">@{u.username ?? "—"}</span>
                <span className="text-sm text-text-2">{u.name}</span>
                {u.platformRole === "superadmin" && <Badge>Superadministrador</Badge>}
                <div className="ml-auto flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ocupado === u.id}
                    onClick={() => void generarEnlace(u)}
                    title="Enlace para elegir contraseña nueva (1 hora, un solo uso)"
                  >
                    <KeyRound className="h-4 w-4" />
                    Enlace de contraseña
                  </Button>
                  {u.platformRole !== "superadmin" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={ocupado === u.id}
                      onClick={() => void borrar(u)}
                      aria-label={`Borrar ${u.username ?? u.email}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-text-3">
                {u.email} · {u.emailVerified ? "verificado ✓" : "sin verificar"} ·{" "}
                {u.negocios.length === 0
                  ? "sin negocio"
                  : u.negocios.map((n, i) => (
                      <span key={n.organizationId}>
                        {i > 0 ? ", " : ""}
                        <Link href={`/admin/${n.organizationId}`} className="hover:underline">
                          {n.name}
                        </Link>{" "}
                        ({n.role === "owner" ? "dueño" : "equipo"})
                      </span>
                    ))}
              </p>
              {enlace?.id === u.id && (
                <div className="space-y-2 rounded-md border bg-subtle p-2 text-xs">
                  <p>Entrégalo por un medio seguro. Sirve una vez y vence en una hora:</p>
                  <p className="break-all font-mono" data-testid="enlace-reset">
                    {enlace.url}
                  </p>
                  <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(enlace.url)}>
                    Copiar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
