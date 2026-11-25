import { asc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { registrarAuditoria } from "@/server/platform/audit";

/**
 * 069 — Qué hace Vocero cuando Meta avisa que alguien quitó la app
 * (desautorización) o pide borrar sus datos. Meta solo manda el `user_id` de
 * quien autorizó «Conectar con Meta»; `meta_credentials.meta_user_id` lo une
 * con las conexiones. Ambas son idempotentes: repetirlas no rompe nada.
 *
 * Lo que se borra es lo que Meta nos dio (token, IDs de cuenta y de número).
 * Las conversaciones y contactos son del negocio, no de quien autorizó.
 */

/** Desautorización: el token ya no vale; las conexiones piden reconectar. */
export async function desautorizarUsuarioMeta(metaUserId: string): Promise<number> {
  const filas = await getDb()
    .update(schema.metaCredentials)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(eq(schema.metaCredentials.metaUserId, metaUserId))
    .returning({ id: schema.metaCredentials.id, organizationId: schema.metaCredentials.organizationId });
  for (const f of filas) {
    await registrarAuditoria({
      action: "meta.desautorizacion",
      organizationId: f.organizationId,
      target: { type: "meta_credentials", id: f.id },
    });
  }
  return filas.length;
}

export type SolicitudDeEliminacion = { confirmationCode: string; numbersRemoved: number };

/**
 * Eliminación de datos: borra las conexiones que autorizó ese usuario y deja
 * un código de confirmación consultable en `/eliminar-datos?codigo=…`.
 * Si un negocio se queda con otros números, el más antiguo pasa a principal.
 */
export async function eliminarDatosDeUsuarioMeta(metaUserId: string): Promise<SolicitudDeEliminacion> {
  const code = randomBytes(9).toString("hex");
  const orgs = new Set<string>();
  let removed = 0;
  await getDb().transaction(async (tx) => {
    const borradas = await tx
      .delete(schema.metaCredentials)
      .where(eq(schema.metaCredentials.metaUserId, metaUserId))
      .returning({ id: schema.metaCredentials.id, organizationId: schema.metaCredentials.organizationId });
    removed = borradas.length;
    for (const b of borradas) orgs.add(b.organizationId);
    for (const orgId of orgs) {
      const restantes = await tx
        .select({ id: schema.metaCredentials.id, isPrimary: schema.metaCredentials.isPrimary })
        .from(schema.metaCredentials)
        .where(eq(schema.metaCredentials.organizationId, orgId))
        .orderBy(asc(schema.metaCredentials.createdAt));
      const primero = restantes[0];
      if (primero && !restantes.some((r) => r.isPrimary)) {
        await tx
          .update(schema.metaCredentials)
          .set({ isPrimary: true })
          .where(eq(schema.metaCredentials.id, primero.id));
      }
    }
    await tx.insert(schema.metaDataDeletion).values({
      id: newId("metaDataDeletion"),
      confirmationCode: code,
      metaUserId,
      status: removed > 0 ? "completada" : "sin_datos",
      numbersRemoved: removed,
    });
  });
  for (const organizationId of orgs) {
    await registrarAuditoria({
      action: "meta.eliminacion_de_datos",
      organizationId,
      detail: { codigo: code },
    });
  }
  return { confirmationCode: code, numbersRemoved: removed };
}

/** Estado público de una solicitud, por su código. No revela el `user_id`. */
export async function estadoDeEliminacion(code: string) {
  if (!/^[a-f0-9]{18}$/.test(code)) return null;
  const [fila] = await getDb()
    .select({
      status: schema.metaDataDeletion.status,
      numbersRemoved: schema.metaDataDeletion.numbersRemoved,
      createdAt: schema.metaDataDeletion.createdAt,
    })
    .from(schema.metaDataDeletion)
    .where(eq(schema.metaDataDeletion.confirmationCode, code))
    .limit(1);
  return fila ?? null;
}
