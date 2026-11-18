import { cache } from "react";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSessionOrNull } from "@/lib/auth/session";
import { primaryOrgId } from "@/server/tenants/primary";

/**
 * 067 — ¿De qué negocio es lo que se está pintando, cuando quien llama no lo
 * sabe (layout raíz, login, manifest)? En orden:
 *   1. la ruta `/t/{slug}` (el middleware la pasa en `x-vocero-tenant`);
 *   2. la organización de la sesión;
 *   3. la organización principal.
 * Memoizado por request. Nunca lanza: fuera de un request cae en la principal.
 */
export const orgDeContexto = cache(async (): Promise<string | null> => {
  try {
    const slug = (await headers()).get("x-vocero-tenant");
    if (slug) {
      const [org] = await getDb()
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .where(and(eq(schema.organization.slug, slug), eq(schema.organization.status, "active")))
        .limit(1);
      if (org) return org.id;
    }
  } catch {
    // Fuera de un request (scripts, pruebas): sin encabezados.
  }
  try {
    const session = await getSessionOrNull();
    if (session) return session.organizationId;
  } catch {
    // Sin request no hay sesión.
  }
  return primaryOrgId();
});
