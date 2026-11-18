import { asc, desc, eq, ne, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";

export type Credentials = {
  id: string;
  organizationId: string;
  /** La Cuenta de WhatsApp (la del número). */
  wabaId: string;
  /** 065 — La Cuenta de mensajes (plantillas y pago), si se conoce. */
  messagingAccountId: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: "connected" | "reconnect_required";
  token: string;
  /** 068 — Nombre del número para el negocio. */
  label: string | null;
  /** 068 — El agente asignado (modo por número). */
  agentProfileId: string | null;
  isPrimary: boolean;
};

type Row = typeof schema.metaCredentials.$inferSelect;

function toCredentials(row: Row): Credentials {
  return {
    id: row.id,
    organizationId: row.organizationId,
    wabaId: row.wabaId,
    messagingAccountId: row.messagingAccountId,
    phoneNumberId: row.phoneNumberId,
    displayPhoneNumber: row.displayPhoneNumber,
    verifiedName: row.verifiedName,
    status: row.status,
    label: row.label,
    agentProfileId: row.agentProfileId,
    isPrimary: row.isPrimary,
    token: decryptSecret({
      cipher: row.tokenCipher,
      iv: row.tokenIv,
      tag: row.tokenTag,
    }),
  };
}

/** Resuelve la conexión por phone_number_id (enrutamiento del webhook). */
export async function getCredentialsByPhoneNumberId(
  phoneNumberId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(eq(schema.metaCredentials.phoneNumberId, phoneNumberId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/**
 * La cuenta donde viven las plantillas: la de mensajes si se conoce (065);
 * si no, la de WhatsApp, como antes del split de 2026.
 */
export function cuentaDePlantillas(
  creds: Pick<Credentials, "wabaId" | "messagingAccountId">
): string {
  return creds.messagingAccountId || creds.wabaId;
}

/**
 * Resuelve la conexión por el `entry.id` de un evento a nivel cuenta (ej.
 * plantillas). 065: puede venir de la Cuenta de WhatsApp o de la de mensajes.
 */
export async function getCredentialsByWabaId(
  wabaId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(
      or(
        eq(schema.metaCredentials.wabaId, wabaId),
        eq(schema.metaCredentials.messagingAccountId, wabaId)
      )
    )
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

export async function getCredentialsByOrg(
  organizationId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(scoped(schema.metaCredentials.organizationId, organizationId))
    // 068 — Con varios números, «el número del negocio» es el principal.
    .orderBy(desc(schema.metaCredentials.isPrimary), asc(schema.metaCredentials.createdAt))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/**
 * 068 — Las credenciales con que se le contesta a una conversación: las del
 * número al que escribió el cliente (siempre del MISMO negocio); si ese
 * número ya no está, el principal.
 */
export async function getCredentialsForNumber(
  organizationId: string,
  phoneNumberId: string | null | undefined
): Promise<Credentials | null> {
  if (phoneNumberId) {
    const rows = await getDb()
      .select()
      .from(schema.metaCredentials)
      .where(
        scoped(
          schema.metaCredentials.organizationId,
          organizationId,
          eq(schema.metaCredentials.phoneNumberId, phoneNumberId)
        )
      )
      .limit(1);
    if (rows[0]) return toCredentials(rows[0]);
  }
  return getCredentialsByOrg(organizationId);
}

/** 068 — Los números del negocio, el principal primero. */
export async function listarNumeros(organizationId: string): Promise<Credentials[]> {
  const rows = await getDb()
    .select()
    .from(schema.metaCredentials)
    .where(scoped(schema.metaCredentials.organizationId, organizationId))
    .orderBy(desc(schema.metaCredentials.isPrimary), asc(schema.metaCredentials.createdAt));
  return rows.map(toCredentials);
}

/**
 * 068 — Agrega un número más al negocio. Si el negocio no tenía ninguno, este
 * queda como principal. Un `phone_number_id` ya conectado en OTRO negocio se
 * rechaza (el webhook enruta por él).
 */
export async function agregarNumero(input: {
  organizationId: string;
  wabaId: string;
  phoneNumberId: string;
  token: string;
  label?: string | null;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; motivo: "ocupado" }> {
  const db = getDb();
  const [ya] = await db
    .select({ id: schema.metaCredentials.id, org: schema.metaCredentials.organizationId })
    .from(schema.metaCredentials)
    .where(eq(schema.metaCredentials.phoneNumberId, input.phoneNumberId))
    .limit(1);
  if (ya && ya.org !== input.organizationId) return { ok: false, motivo: "ocupado" };
  const enc = encryptSecret(input.token);
  if (ya) {
    await db
      .update(schema.metaCredentials)
      .set({
        wabaId: input.wabaId,
        tokenCipher: enc.cipher,
        tokenIv: enc.iv,
        tokenTag: enc.tag,
        status: "connected",
        ...(input.label !== undefined ? { label: input.label } : {}),
        displayPhoneNumber: input.displayPhoneNumber ?? null,
        verifiedName: input.verifiedName ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.metaCredentials.id, ya.id));
    return { ok: true, id: ya.id };
  }
  const tienePrincipal = (await getCredentialsByOrg(input.organizationId)) !== null;
  const id = newId("credentials");
  await db.insert(schema.metaCredentials).values({
    id,
    organizationId: input.organizationId,
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    displayPhoneNumber: input.displayPhoneNumber ?? null,
    verifiedName: input.verifiedName ?? null,
    label: input.label ?? null,
    tokenCipher: enc.cipher,
    tokenIv: enc.iv,
    tokenTag: enc.tag,
    status: "connected",
    isPrimary: !tienePrincipal,
  });
  return { ok: true, id };
}

/** 068 — Cambia nombre, agente asignado o lo vuelve principal. */
export async function actualizarNumero(
  organizationId: string,
  id: string,
  cambios: { label?: string | null; agentProfileId?: string | null; isPrimary?: true }
): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [fila] = await tx
      .select({ id: schema.metaCredentials.id })
      .from(schema.metaCredentials)
      .where(scoped(schema.metaCredentials.organizationId, organizationId, eq(schema.metaCredentials.id, id)))
      .limit(1);
    if (!fila) return false;
    if (cambios.isPrimary) {
      await tx
        .update(schema.metaCredentials)
        .set({ isPrimary: false })
        .where(scoped(schema.metaCredentials.organizationId, organizationId, ne(schema.metaCredentials.id, id)));
    }
    await tx
      .update(schema.metaCredentials)
      .set({
        ...(cambios.label !== undefined ? { label: cambios.label } : {}),
        ...(cambios.agentProfileId !== undefined ? { agentProfileId: cambios.agentProfileId } : {}),
        ...(cambios.isPrimary ? { isPrimary: true } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.metaCredentials.id, id));
    return true;
  });
}

/**
 * 068 — Quita UN número. Sus conversaciones se quedan (son del negocio); si
 * era el principal, el más antiguo que quede pasa a serlo.
 */
export async function quitarNumero(organizationId: string, id: string): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [borrada] = await tx
      .delete(schema.metaCredentials)
      .where(scoped(schema.metaCredentials.organizationId, organizationId, eq(schema.metaCredentials.id, id)))
      .returning({ isPrimary: schema.metaCredentials.isPrimary });
    if (!borrada) return false;
    if (borrada.isPrimary) {
      const [siguiente] = await tx
        .select({ id: schema.metaCredentials.id })
        .from(schema.metaCredentials)
        .where(scoped(schema.metaCredentials.organizationId, organizationId))
        .orderBy(asc(schema.metaCredentials.createdAt))
        .limit(1);
      if (siguiente) {
        await tx
          .update(schema.metaCredentials)
          .set({ isPrimary: true })
          .where(eq(schema.metaCredentials.id, siguiente.id));
      }
    }
    return true;
  });
}

/**
 * Guarda la conexión PRINCIPAL del negocio (el asistente de Ajustes →
 * WhatsApp y el Embedded Signup). 068: si ya hay principal, se reemplaza esa
 * fila; los demás números no se tocan.
 */
export async function saveCredentials(input: {
  organizationId: string;
  wabaId: string;
  /** 065 — `undefined` conserva la guardada; `null` la borra. */
  messagingAccountId?: string | null;
  phoneNumberId: string;
  token: string;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
}): Promise<void> {
  const db = getDb();
  const enc = encryptSecret(input.token);
  const principal = await getCredentialsByOrg(input.organizationId);
  const datos = {
    wabaId: input.wabaId,
    ...(input.messagingAccountId !== undefined
      ? { messagingAccountId: input.messagingAccountId }
      : {}),
    phoneNumberId: input.phoneNumberId,
    displayPhoneNumber: input.displayPhoneNumber ?? null,
    verifiedName: input.verifiedName ?? null,
    tokenCipher: enc.cipher,
    tokenIv: enc.iv,
    tokenTag: enc.tag,
    status: "connected" as const,
  };
  await db.transaction(async (tx) => {
    // Si el número ya era uno secundario de este negocio, se vuelve el principal.
    const [mismo] = await tx
      .select({ id: schema.metaCredentials.id })
      .from(schema.metaCredentials)
      .where(
        scoped(
          schema.metaCredentials.organizationId,
          input.organizationId,
          eq(schema.metaCredentials.phoneNumberId, input.phoneNumberId)
        )
      )
      .limit(1);
    if (mismo && mismo.id !== principal?.id) {
      if (principal) {
        await tx.delete(schema.metaCredentials).where(eq(schema.metaCredentials.id, principal.id));
      }
      await tx
        .update(schema.metaCredentials)
        .set({ ...datos, isPrimary: true, updatedAt: new Date() })
        .where(eq(schema.metaCredentials.id, mismo.id));
      return;
    }
    if (principal) {
      await tx
        .update(schema.metaCredentials)
        .set({ ...datos, updatedAt: new Date() })
        .where(eq(schema.metaCredentials.id, principal.id));
      return;
    }
    await tx.insert(schema.metaCredentials).values({
      id: newId("credentials"),
      organizationId: input.organizationId,
      messagingAccountId: input.messagingAccountId ?? null,
      ...datos,
      isPrimary: true,
    });
  });
}

/**
 * Desconectar el número: borra las credenciales cifradas de la organización.
 *
 * No toca conversaciones, contactos ni leads — son de la organización, no de
 * la conexión. Idempotente: sin fila, no hay nada que borrar.
 */
export async function desconectarCanal(organizationId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.metaCredentials)
    .where(scoped(schema.metaCredentials.organizationId, organizationId));
}

/** Marca la conexión como vencida (token inválido detectado en runtime). */
export async function markReconnectRequired(
  organizationId: string,
  /** 068 — Solo ese número; sin él, todos los del negocio. */
  phoneNumberId?: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.metaCredentials)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(
      scoped(
        schema.metaCredentials.organizationId,
        organizationId,
        phoneNumberId ? eq(schema.metaCredentials.phoneNumberId, phoneNumberId) : undefined
      )
    );
}

/** Últimos 4 caracteres del token para mostrar en UI (jamás el token). */
export function tokenLast4(token: string): string {
  return token.slice(-4);
}
