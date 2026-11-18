import { rm } from "node:fs/promises";
import path from "node:path";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { getEnv } from "@/lib/env";
import { sembrarOrganizacion } from "@/server/auth/on-signup";
import { esSuperadmin } from "@/server/tenants/superadmin";
import { primaryOrgId, resetPrimaryOrgCache } from "@/server/tenants/primary";
import { validarSlug, type SlugInvalido } from "@/lib/tenant-slug";

/**
 * 067 — Operación de tenants (solo superusuario; las rutas lo verifican).
 *
 * Un tenant es una `organization` de Better Auth con todo lo que cuelga de
 * ella por `organization_id` (FK en cascada en las 31 tablas de dominio).
 */

export type TenantResumen = {
  id: string;
  name: string;
  slug: string | null;
  status: "active" | "suspended";
  suspendedAt: string | null;
  createdAt: string;
  members: number;
  whatsapp: { connected: boolean; phone: string | null };
  isPrimary: boolean;
};

export async function listarTenants(): Promise<TenantResumen[]> {
  const db = getDb();
  const [orgs, miembros, numeros, primary] = await Promise.all([
    db
      .select()
      .from(schema.organization)
      .orderBy(asc(schema.organization.createdAt), asc(schema.organization.id)),
    db
      .select({ organizationId: schema.member.organizationId, n: count() })
      .from(schema.member)
      .groupBy(schema.member.organizationId),
    db
      .select({
        organizationId: schema.metaCredentials.organizationId,
        status: schema.metaCredentials.status,
        phone: schema.metaCredentials.displayPhoneNumber,
      })
      .from(schema.metaCredentials),
    primaryOrgId(),
  ]);
  const n = new Map(miembros.map((m) => [m.organizationId, m.n]));
  const wa = new Map(numeros.map((w) => [w.organizationId, w]));
  return orgs.map((o) => {
    const w = wa.get(o.id);
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      status: o.status,
      suspendedAt: o.suspendedAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
      members: n.get(o.id) ?? 0,
      whatsapp: { connected: w?.status === "connected", phone: w?.phone ?? null },
      isPrimary: o.id === primary,
    };
  });
}

export async function tenantPorId(id: string) {
  const [org] = await getDb()
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.id, id))
    .limit(1);
  return org ?? null;
}

export async function tenantPorSlug(slug: string) {
  const [org] = await getDb()
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.slug, slug.toLowerCase()))
    .limit(1);
  return org ?? null;
}

export async function miembrosDe(organizationId: string) {
  return getDb()
    .select({
      id: schema.member.id,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
      userId: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.member.organizationId, organizationId))
    .orderBy(asc(schema.member.createdAt));
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

export type AltaTenant = {
  name: string;
  slug: string;
  owner: { name: string; email: string; password: string };
};

export type ResultadoAlta =
  | { ok: true; organizationId: string; slug: string }
  | { ok: false; motivo: SlugInvalido | "slug_ocupado" | "correo_ocupado" | "cuenta"; detalle?: string };

export async function crearTenant(input: AltaTenant): Promise<ResultadoAlta> {
  const v = validarSlug(input.slug);
  if (!v.ok) return { ok: false, motivo: v.motivo };
  const slug = v.slug;
  const db = getDb();
  const email = input.owner.email.trim().toLowerCase();

  if (await tenantPorSlug(slug)) return { ok: false, motivo: "slug_ocupado" };
  const [existente] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  if (existente) return { ok: false, motivo: "correo_ocupado" };

  // La organización primero: el hook de alta de usuario (`onUserCreated`) solo
  // crea organización en una instancia vacía, y así nunca lo es.
  const orgId = newId("organization");
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.organization).values({
        id: orgId,
        name: input.name.trim(),
        slug,
      });
      await sembrarOrganizacion(tx, orgId);
    });
  } catch (err) {
    if (/unique|duplicate/i.test(String(err))) return { ok: false, motivo: "slug_ocupado" };
    throw err;
  }

  let userId: string;
  try {
    const result = await runInternalSignup(() =>
      getAuth().api.signUpEmail({
        body: { name: input.owner.name.trim(), email, password: input.owner.password },
      })
    );
    userId = result.user.id;
  } catch (err) {
    // Sin dueño no hay tenant: se deshace la organización recién creada.
    await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    const detalle = err instanceof Error ? err.message : String(err);
    return /exist/i.test(detalle)
      ? { ok: false, motivo: "correo_ocupado" }
      : { ok: false, motivo: "cuenta", detalle };
  }

  await db
    .insert(schema.member)
    .values({ id: newId("member"), organizationId: orgId, userId, role: "owner" })
    .onConflictDoNothing();
  return { ok: true, organizationId: orgId, slug };
}

// ---------------------------------------------------------------------------
// Edición, suspensión, borrado
// ---------------------------------------------------------------------------

export async function renombrarTenant(
  id: string,
  cambios: { name?: string; slug?: string }
): Promise<{ ok: true } | { ok: false; motivo: SlugInvalido | "slug_ocupado" | "no_encontrado" }> {
  const org = await tenantPorId(id);
  if (!org) return { ok: false, motivo: "no_encontrado" };
  const set: { name?: string; slug?: string } = {};
  if (cambios.name?.trim()) set.name = cambios.name.trim();
  if (cambios.slug !== undefined && cambios.slug !== org.slug) {
    const v = validarSlug(cambios.slug);
    if (!v.ok) return { ok: false, motivo: v.motivo };
    const otro = await tenantPorSlug(v.slug);
    if (otro && otro.id !== id) return { ok: false, motivo: "slug_ocupado" };
    set.slug = v.slug;
  }
  if (Object.keys(set).length === 0) return { ok: true };
  await getDb().update(schema.organization).set(set).where(eq(schema.organization.id, id));
  return { ok: true };
}

export async function cambiarEstadoTenant(
  id: string,
  status: "active" | "suspended"
): Promise<boolean> {
  const rows = await getDb()
    .update(schema.organization)
    .set({ status, suspendedAt: status === "suspended" ? new Date() : null })
    .where(eq(schema.organization.id, id))
    .returning({ id: schema.organization.id });
  return rows.length > 0;
}

export type ResultadoBorrado =
  | { ok: true; usuariosBorrados: number; archivos: "borrados" | "sin_archivos" | "pendiente_bucket" }
  | { ok: false; motivo: "no_encontrado" | "confirmacion" | "activo" | "propio" };

/**
 * Borrado DEFINITIVO. Exige que el tenant esté suspendido (dos pasos a
 * propósito) y que `confirmacion` sea su web ID. Borra la organización (y en
 * cascada todo lo suyo), sus archivos en `MEDIA_DIR/{orgId}` y las cuentas que
 * se quedan sin ninguna membresía, salvo superusuarios.
 */
export async function borrarTenant(
  id: string,
  confirmacion: string,
  actor: { userId: string }
): Promise<ResultadoBorrado> {
  const db = getDb();
  const org = await tenantPorId(id);
  if (!org) return { ok: false, motivo: "no_encontrado" };
  if (confirmacion.trim().toLowerCase() !== (org.slug ?? org.id)) {
    return { ok: false, motivo: "confirmacion" };
  }
  if (org.status !== "suspended") return { ok: false, motivo: "activo" };
  const [propia] = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, id), eq(schema.member.userId, actor.userId)))
    .limit(1);
  if (propia) return { ok: false, motivo: "propio" };

  const usuariosBorrados = await db.transaction(async (tx) => {
    const miembros = await tx
      .select({ userId: schema.member.userId })
      .from(schema.member)
      .where(eq(schema.member.organizationId, id));
    await tx.delete(schema.organization).where(eq(schema.organization.id, id));
    const ids = miembros.map((m) => m.userId);
    if (ids.length === 0) return 0;
    // Quienes ya no pertenecen a ningún tenant.
    const huerfanos = await tx
      .select({ id: schema.user.id, email: schema.user.email })
      .from(schema.user)
      .leftJoin(schema.member, eq(schema.member.userId, schema.user.id))
      .where(and(inArray(schema.user.id, ids), isNull(schema.member.id)));
    const borrables = huerfanos.filter((u) => !esSuperadmin(u.email)).map((u) => u.id);
    if (borrables.length === 0) return 0;
    await tx.delete(schema.user).where(inArray(schema.user.id, borrables));
    return borrables.length;
  });
  resetPrimaryOrgCache();

  let archivos: "borrados" | "sin_archivos" | "pendiente_bucket" = "sin_archivos";
  if (process.env.MEDIA_STORE === "bucket") {
    archivos = "pendiente_bucket";
  } else {
    const raiz = path.resolve(getEnv().MEDIA_DIR);
    const dir = path.resolve(raiz, id);
    // Nunca fuera de MEDIA_DIR, por raro que venga el id.
    if (dir.startsWith(raiz + path.sep)) {
      try {
        await rm(dir, { recursive: true, force: true });
        archivos = "borrados";
      } catch (err) {
        console.error(`[tenants] no se pudieron borrar los archivos de ${id}:`, err);
      }
    }
  }
  console.log(`[tenants] borrado definitivo de ${org.slug ?? id} (${usuariosBorrados} cuentas)`);
  return { ok: true, usuariosBorrados, archivos };
}

/** Para pruebas y diagnóstico: filas que aún apuntan a una organización. */
export async function filasRestantes(organizationId: string): Promise<number> {
  const db = getDb();
  const res = await db.execute<{ n: number }>(sql`
    select coalesce(sum(n), 0)::int as n from (
      select count(*) as n from member where organization_id = ${organizationId}
      union all select count(*) from contact where organization_id = ${organizationId}
      union all select count(*) from conversation where organization_id = ${organizationId}
      union all select count(*) from pipeline_stage where organization_id = ${organizationId}
      union all select count(*) from agent_profile where organization_id = ${organizationId}
      union all select count(*) from brain_connection where organization_id = ${organizationId}
    ) t`);
  const rows = res as unknown as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}
