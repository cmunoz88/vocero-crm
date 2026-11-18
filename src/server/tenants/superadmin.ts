import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

/**
 * 068 — Quién es superadministrador: el rol global `platform_role =
 * 'superadmin'` en la base. Solo lo pone el arranque (Optimus, ver
 * `src/server/platform/optimus.ts`); no hay pantalla ni API que convierta a
 * alguien en superadministrador.
 */
export async function esSuperadminUsuario(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const [row] = await getDb()
    .select({ role: schema.user.platformRole })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  return row?.role === "superadmin";
}

export type Superadmin = { userId: string; email: string; name: string; username: string | null };

/** El superadministrador de la sesión actual, o `null` (sin sesión o no lo es). */
export async function superadminActual(): Promise<Superadmin | null> {
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (!session) return null;
    const [row] = await getDb()
      .select({ role: schema.user.platformRole, username: schema.user.displayUsername })
      .from(schema.user)
      .where(eq(schema.user.id, session.user.id))
      .limit(1);
    if (row?.role !== "superadmin") return null;
    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      username: row.username ?? null,
    };
  } catch {
    return null;
  }
}
