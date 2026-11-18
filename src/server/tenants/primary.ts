import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * 067 — La organización principal: la más antigua de la instancia (la del
 * primer registro). Hereda lo que antes era «de la instancia», como las
 * variables de entorno del cerebro. Cacheada: el orden por fecha de creación
 * no cambia, y solo se invalida al borrar un tenant.
 */
const g = globalThis as unknown as { __voceroPrimaryOrg?: string | null };

export async function primaryOrgId(): Promise<string | null> {
  if (g.__voceroPrimaryOrg) return g.__voceroPrimaryOrg;
  const [row] = await getDb()
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .orderBy(asc(schema.organization.createdAt), asc(schema.organization.id))
    .limit(1);
  g.__voceroPrimaryOrg = row?.id ?? null;
  return g.__voceroPrimaryOrg;
}

export function resetPrimaryOrgCache(): void {
  delete g.__voceroPrimaryOrg;
}
