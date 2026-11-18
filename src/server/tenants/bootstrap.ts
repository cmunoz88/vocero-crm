import { isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/** 067 — ¿Algún negocio tiene su propio cerebro? Entonces el worker arranca aunque el entorno no tenga uno. */
export async function hayCerebrosPorNegocio(): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: schema.brainConnection.id })
    .from(schema.brainConnection)
    .where(isNotNull(schema.brainConnection.dispatchUrl))
    .limit(1);
  return Boolean(row);
}
