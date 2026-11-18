import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { clientIp } from "@/lib/rate-limit";

/**
 * 068 — Bitácora de acciones administrativas. Nunca recibe secretos (ni
 * contraseñas, ni tokens, ni llaves). Su fallo jamás tumba la acción.
 */
export type EventoAuditoria = {
  actor?: { userId: string; label?: string | null } | null;
  action: string;
  organizationId?: string | null;
  target?: { type: string; id: string } | null;
  detail?: Record<string, unknown>;
  req?: Request | null;
};

export async function registrarAuditoria(e: EventoAuditoria): Promise<void> {
  try {
    await getDb()
      .insert(schema.auditLog)
      .values({
        id: newId("auditLog"),
        actorUserId: e.actor?.userId ?? null,
        actorLabel: e.actor?.label ?? null,
        action: e.action,
        organizationId: e.organizationId ?? null,
        targetType: e.target?.type ?? null,
        targetId: e.target?.id ?? null,
        detail: e.detail ?? null,
        ip: e.req ? clientIp(e.req.headers) : null,
      });
  } catch (err) {
    console.error("[auditoria] no se pudo registrar:", err instanceof Error ? err.message : String(err));
  }
}

export async function ultimosEventos(limite = 100, organizationId?: string) {
  const q = getDb().select().from(schema.auditLog);
  const filas = await (organizationId ? q.where(eq(schema.auditLog.organizationId, organizationId)) : q)
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(limite);
  return filas.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }));
}
