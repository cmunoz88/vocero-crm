import { and, count, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * 068 · etapa 4 — Números por negocio para el panel del superadministrador.
 * Solo conteos: el contenido de las conversaciones jamás sale de su negocio.
 * Las conversaciones del Laboratorio no cuentan.
 */
export type EstadisticasNegocio = {
  conversaciones: number;
  mensajes30d: number;
  numeros: number;
  agentes: number;
  ia: boolean;
};

export async function estadisticasPorNegocio(): Promise<Map<string, EstadisticasNegocio>> {
  const db = getDb();
  const hace30 = new Date(Date.now() - 30 * 86_400_000);
  const [convs, msgs, nums, agentes] = await Promise.all([
    db
      .select({ org: schema.conversation.organizationId, n: count() })
      .from(schema.conversation)
      .where(eq(schema.conversation.isTest, false))
      .groupBy(schema.conversation.organizationId),
    db
      .select({ org: schema.message.organizationId, n: count() })
      .from(schema.message)
      .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
      .where(and(eq(schema.conversation.isTest, false), gte(schema.message.createdAt, hace30)))
      .groupBy(schema.message.organizationId),
    db
      .select({ org: schema.metaCredentials.organizationId, n: count() })
      .from(schema.metaCredentials)
      .groupBy(schema.metaCredentials.organizationId),
    db
      .select({
        org: schema.agentProfile.organizationId,
        enabled: schema.agentProfile.enabled,
        isDefault: schema.agentProfile.isDefault,
      })
      .from(schema.agentProfile),
  ]);
  const m = new Map<string, EstadisticasNegocio>();
  const de = (org: string) => {
    let e = m.get(org);
    if (!e) {
      e = { conversaciones: 0, mensajes30d: 0, numeros: 0, agentes: 0, ia: false };
      m.set(org, e);
    }
    return e;
  };
  for (const c of convs) de(c.org).conversaciones = c.n;
  for (const x of msgs) de(x.org).mensajes30d = x.n;
  for (const n of nums) de(n.org).numeros = n.n;
  for (const a of agentes) {
    const e = de(a.org);
    e.agentes += 1;
    if (a.isDefault) e.ia = a.enabled;
  }
  return m;
}
