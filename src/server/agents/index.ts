import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

/**
 * 068 — Varios agentes por negocio. Uno es el PRINCIPAL (`is_default`): su
 * `enabled` es el interruptor de la IA de todo el negocio, y es el que
 * contesta todos los números en modo `compartido`. En modo `por_numero`, cada
 * número contesta con el agente que tenga asignado (o el principal si no).
 */
export type Agente = typeof schema.agentProfile.$inferSelect;

/** Condición SQL: el agente principal. */
export function esAgentePrincipal() {
  return eq(schema.agentProfile.isDefault, true);
}

export async function agentePrincipal(organizationId: string): Promise<Agente | null> {
  const [a] = await getDb()
    .select()
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, organizationId, esAgentePrincipal()))
    .limit(1);
  return a ?? null;
}

export async function listarAgentes(organizationId: string): Promise<Agente[]> {
  return getDb()
    .select()
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, organizationId))
    .orderBy(asc(schema.agentProfile.createdAt));
}

export async function agentePorId(organizationId: string, id: string): Promise<Agente | null> {
  const [a] = await getDb()
    .select()
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, organizationId, eq(schema.agentProfile.id, id)))
    .limit(1);
  return a ?? null;
}

export async function modoDeAgentes(organizationId: string): Promise<"compartido" | "por_numero"> {
  const [o] = await getDb()
    .select({ modo: schema.organization.agentMode })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  return o?.modo ?? "compartido";
}

/** El agente de un número: el asignado (modo por número) o el principal. */
export async function agenteDeNumero(organizationId: string, phoneNumberId: string | null | undefined): Promise<Agente | null> {
  if (phoneNumberId && (await modoDeAgentes(organizationId)) === "por_numero") {
    const [c] = await getDb()
      .select({ agente: schema.metaCredentials.agentProfileId })
      .from(schema.metaCredentials)
      .where(
        scoped(
          schema.metaCredentials.organizationId,
          organizationId,
          eq(schema.metaCredentials.phoneNumberId, phoneNumberId)
        )
      )
      .limit(1);
    if (c?.agente) {
      const a = await agentePorId(organizationId, c.agente);
      if (a) return a;
    }
  }
  return agentePrincipal(organizationId);
}

/** El agente que atiende una conversación (por el número al que escribió el cliente). */
export async function agenteDeConversacion(organizationId: string, conversationId: string): Promise<Agente | null> {
  const [conv] = await getDb()
    .select({ numero: schema.conversation.waPhoneNumberId })
    .from(schema.conversation)
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, conversationId)))
    .limit(1);
  return agenteDeNumero(organizationId, conv?.numero ?? null);
}

/** Un agente nuevo copia la forma del principal (rol, herramientas, tono) con su propio nombre. */
export async function crearAgente(organizationId: string, nombre: string): Promise<Agente> {
  const base = await agentePrincipal(organizationId);
  const [a] = await getDb()
    .insert(schema.agentProfile)
    .values({
      id: newId("agentProfile"),
      organizationId,
      name: nombre.trim(),
      enabled: true,
      isDefault: false,
      role: base?.role ?? "calificador",
      tone: base?.tone ?? null,
      tools: base?.tools ?? null,
      escalationRules: base?.escalationRules ?? null,
    })
    .returning();
  return a!;
}

/** Borra un agente que no sea el principal; sus números vuelven al principal. */
export async function borrarAgente(organizationId: string, id: string): Promise<"ok" | "principal" | "no_encontrado"> {
  const a = await agentePorId(organizationId, id);
  if (!a) return "no_encontrado";
  if (a.isDefault) return "principal";
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.metaCredentials)
      .set({ agentProfileId: null, updatedAt: new Date() })
      .where(
        and(eq(schema.metaCredentials.organizationId, organizationId), eq(schema.metaCredentials.agentProfileId, id))
      );
    await tx.delete(schema.agentProfile).where(eq(schema.agentProfile.id, id));
  });
  return "ok";
}

export async function cambiarModoAgentes(organizationId: string, modo: "compartido" | "por_numero"): Promise<void> {
  await getDb().update(schema.organization).set({ agentMode: modo }).where(eq(schema.organization.id, organizationId));
}
