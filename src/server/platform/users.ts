import { randomBytes } from "node:crypto";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";

/** 068 — Las cuentas de toda la plataforma, para el superadministrador. */
export async function listarUsuarios() {
  const db = getDb();
  const users = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      emailVerified: schema.user.emailVerified,
      username: schema.user.displayUsername,
      platformRole: schema.user.platformRole,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .orderBy(asc(schema.user.createdAt));
  const membresias = await db
    .select({
      userId: schema.member.userId,
      role: schema.member.role,
      organizationId: schema.organization.id,
      name: schema.organization.name,
      slug: schema.organization.slug,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId));
  return users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    negocios: membresias
      .filter((m) => m.userId === u.id)
      .map(({ organizationId, name, slug, role }) => ({ organizationId, name, slug, role })),
  }));
}

export type BorradoUsuario =
  | { ok: true }
  | { ok: false; motivo: "no_encontrado" | "uno_mismo" | "superadmin" | "unico_dueno"; negocios?: string[] };

/** Borra una cuenta. Nunca la propia, la del superadministrador ni la del único dueño de un negocio. */
export async function borrarUsuario(id: string, actorId: string): Promise<BorradoUsuario> {
  if (id === actorId) return { ok: false, motivo: "uno_mismo" };
  const db = getDb();
  const [u] = await db
    .select({ id: schema.user.id, role: schema.user.platformRole })
    .from(schema.user)
    .where(eq(schema.user.id, id))
    .limit(1);
  if (!u) return { ok: false, motivo: "no_encontrado" };
  if (u.role === "superadmin") return { ok: false, motivo: "superadmin" };
  const comoDueno = await db
    .select({ organizationId: schema.member.organizationId, name: schema.organization.name })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(and(eq(schema.member.userId, id), eq(schema.member.role, "owner")));
  if (comoDueno.length) {
    const orgs = comoDueno.map((c) => c.organizationId);
    const duenos = await db
      .select({ org: schema.member.organizationId, n: count() })
      .from(schema.member)
      .where(and(inArray(schema.member.organizationId, orgs), eq(schema.member.role, "owner")))
      .groupBy(schema.member.organizationId);
    const solos = comoDueno.filter((c) => (duenos.find((d) => d.org === c.organizationId)?.n ?? 0) <= 1);
    if (solos.length) return { ok: false, motivo: "unico_dueno", negocios: solos.map((s) => s.name) };
  }
  await db.delete(schema.user).where(eq(schema.user.id, id));
  return { ok: true };
}

/**
 * Enlace de restablecimiento copiable (sin correo): el mismo token de un solo
 * uso y 1 hora que manda el correo, pero se lo entrega el superadministrador.
 */
export async function enlaceRestablecer(userId: string): Promise<string | null> {
  const [u] = await getDb().select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  if (!u) return null;
  const ctx = await getAuth().$context;
  const token = randomBytes(24).toString("base64url");
  await ctx.internalAdapter.createVerificationValue({
    identifier: `reset-password:${token}`,
    value: userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const base = getEnv().APP_BASE_URL;
  return `${base}/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(`${base}/restablecer`)}`;
}
