import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { getEnv } from "@/lib/env";
import { sugerirSlug, validarSlug } from "@/lib/tenant-slug";
import { correoConEnlace, correoHabilitado, enviarCorreo } from "@/server/email";
import { registrarAuditoria } from "@/server/platform/audit";
import { usernameValido } from "@/server/platform/usernames";
import { crearTenant, tenantPorSlug } from "@/server/tenants/service";

/**
 * 068 — Invitar un negocio: el superadministrador genera un enlace único; el
 * cliente pone el nombre de su negocio y su correo, lo verifica, y elige su
 * usuario y contraseña. Entonces se crean el negocio, su cuenta y la
 * membresía de dueño, en un solo paso.
 *
 *   pendiente → verificando → verificada → (consumiendo) → usada
 *                                                        ↘ revocada
 * Token (32 bytes) y código (24 bytes) solo se guardan como SHA-256.
 */

export const VIGENCIA_DIAS = 7;
const VIGENCIA_CODIGO_MS = 24 * 60 * 60 * 1000;

const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const aleatorio = (bytes: number) => randomBytes(bytes).toString("base64url");
const base = () => getEnv().APP_BASE_URL;

export type Invitacion = typeof schema.businessInvitation.$inferSelect;

export function urlInvitacion(token: string): string {
  return `${base()}/invitacion/${token}`;
}
function urlVerificacion(token: string, codigo: string): string {
  return `${base()}/invitacion/${token}/verificar?c=${codigo}`;
}

/** Estado visible: una pendiente que ya venció se ve «vencida». */
export function estadoVisible(i: Pick<Invitacion, "status" | "expiresAt">): Invitacion["status"] | "vencida" {
  if (i.status === "usada" || i.status === "revocada") return i.status;
  return i.expiresAt.getTime() <= Date.now() ? "vencida" : i.status;
}

export async function crearInvitacion(input: { note?: string | null; createdBy: string; dias?: number }) {
  const token = aleatorio(32);
  const dias = Math.min(Math.max(input.dias ?? VIGENCIA_DIAS, 1), 30);
  const [row] = await getDb()
    .insert(schema.businessInvitation)
    .values({
      id: newId("businessInvitation"),
      tokenHash: hash(token),
      note: input.note?.trim() || null,
      createdBy: input.createdBy,
      expiresAt: new Date(Date.now() + dias * 24 * 60 * 60 * 1000),
    })
    .returning();
  return { invitacion: row!, url: urlInvitacion(token) };
}

export async function listarInvitaciones() {
  const filas = await getDb()
    .select()
    .from(schema.businessInvitation)
    .orderBy(desc(schema.businessInvitation.createdAt))
    .limit(200);
  return filas.map((i) => ({
    id: i.id,
    note: i.note,
    status: estadoVisible(i),
    businessName: i.businessName,
    email: i.email,
    organizationId: i.organizationId,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
    usedAt: i.usedAt?.toISOString() ?? null,
  }));
}

export async function revocarInvitacion(id: string): Promise<boolean> {
  const r = await getDb()
    .update(schema.businessInvitation)
    .set({ status: "revocada", updatedAt: new Date() })
    .where(
      and(
        eq(schema.businessInvitation.id, id),
        sql`${schema.businessInvitation.status} not in ('usada', 'consumiendo')`
      )
    )
    .returning({ id: schema.businessInvitation.id });
  return r.length > 0;
}

/** La invitación de un token, si sigue sirviendo (no usada, no revocada, no vencida). */
export async function invitacionVigente(token: string): Promise<Invitacion | null> {
  if (!token || token.length > 128) return null;
  const [i] = await getDb()
    .select()
    .from(schema.businessInvitation)
    .where(
      and(
        eq(schema.businessInvitation.tokenHash, hash(token)),
        gt(schema.businessInvitation.expiresAt, new Date())
      )
    )
    .limit(1);
  if (!i || i.status === "usada" || i.status === "revocada" || i.status === "consumiendo") return null;
  return i;
}

async function nuevoCodigo(id: string): Promise<string> {
  const codigo = aleatorio(24);
  await getDb()
    .update(schema.businessInvitation)
    .set({
      codeHash: hash(codigo),
      codeExpiresAt: new Date(Date.now() + VIGENCIA_CODIGO_MS),
      status: "verificando",
      updatedAt: new Date(),
    })
    .where(eq(schema.businessInvitation.id, id));
  return codigo;
}

export type ResultadoSolicitud =
  | { ok: true; enviado: boolean }
  | { ok: false; motivo: "invalida" | "correo_ocupado" | "ya_verificada" };

/** Paso 1 del cliente: nombre del negocio y correo → correo de verificación. */
export async function solicitarInvitacion(
  token: string,
  datos: { negocio: string; email: string },
  req?: Request
): Promise<ResultadoSolicitud> {
  const inv = await invitacionVigente(token);
  if (!inv) return { ok: false, motivo: "invalida" };
  if (inv.status === "verificada") return { ok: false, motivo: "ya_verificada" };
  const email = datos.email.trim().toLowerCase();
  const db = getDb();
  const [ocupado] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  if (ocupado) return { ok: false, motivo: "correo_ocupado" };
  await db
    .update(schema.businessInvitation)
    .set({ businessName: datos.negocio.trim(), email, updatedAt: new Date() })
    .where(eq(schema.businessInvitation.id, inv.id));
  const codigo = await nuevoCodigo(inv.id);
  const enviado = correoHabilitado()
    ? await enviarCorreo(
        correoConEnlace({
          para: email,
          asunto: `Confirma tu correo para registrar ${datos.negocio.trim()}`,
          saludo: "Hola:",
          cuerpo: `Para terminar de registrar «${datos.negocio.trim()}», confirma que este correo es tuyo. El enlace vence en 24 horas.`,
          boton: "Confirmar mi correo",
          url: urlVerificacion(token, codigo),
          pie: "Si no pediste esto, ignora este correo.",
        })
      )
    : false;
  await registrarAuditoria({
    action: "invitacion.solicitada",
    target: { type: "invitation", id: inv.id },
    detail: { enviado },
    req,
  });
  return { ok: true, enviado };
}

/**
 * Sin correo (o si el cliente no lo recibe): el superadministrador genera un
 * enlace de verificación nuevo y se lo entrega él.
 */
export async function enlaceVerificacionManual(id: string): Promise<string | null> {
  const [inv] = await getDb()
    .select()
    .from(schema.businessInvitation)
    .where(eq(schema.businessInvitation.id, id))
    .limit(1);
  if (!inv || inv.status !== "verificando" || inv.expiresAt.getTime() <= Date.now()) return null;
  // El token original no se guarda: se rota (el enlace de invitación viejo deja de servir).
  const token = aleatorio(32);
  const codigo = aleatorio(24);
  await getDb()
    .update(schema.businessInvitation)
    .set({
      tokenHash: hash(token),
      codeHash: hash(codigo),
      codeExpiresAt: new Date(Date.now() + VIGENCIA_CODIGO_MS),
      updatedAt: new Date(),
    })
    .where(eq(schema.businessInvitation.id, id));
  return urlVerificacion(token, codigo);
}

/** Paso 2: el enlace del correo. Deja la invitación «verificada». */
export async function verificarCorreoInvitacion(token: string, codigo: string): Promise<Invitacion | null> {
  const inv = await invitacionVigente(token);
  if (!inv || !codigo || !inv.codeHash || inv.codeHash !== hash(codigo)) return null;
  if (inv.status === "verificada") return inv;
  if (inv.status !== "verificando" || !inv.codeExpiresAt || inv.codeExpiresAt.getTime() <= Date.now()) return null;
  const [row] = await getDb()
    .update(schema.businessInvitation)
    .set({ status: "verificada", verifiedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.businessInvitation.id, inv.id), eq(schema.businessInvitation.status, "verificando")))
    .returning();
  if (row) await registrarAuditoria({ action: "invitacion.verificada", target: { type: "invitation", id: inv.id } });
  return row ?? inv;
}

async function slugLibre(nombre: string): Promise<string> {
  let baseSlug = sugerirSlug(nombre);
  if (!validarSlug(baseSlug).ok) baseSlug = `negocio-${randomBytes(3).toString("hex")}`;
  for (let i = 1; i < 200; i++) {
    const candidato = i === 1 ? baseSlug : `${baseSlug.slice(0, 36)}-${i}`;
    if (validarSlug(candidato).ok && !(await tenantPorSlug(candidato))) return candidato;
  }
  return `negocio-${randomBytes(4).toString("hex")}`;
}

export type ResultadoCompletar =
  | { ok: true; slug: string; username: string; organizationId: string }
  | { ok: false; motivo: "invalida" | "usuario_invalido" | "usuario_ocupado" | "correo_ocupado" | "cuenta"; detalle?: string };

/**
 * Paso 3: usuario y contraseña → negocio + cuenta + dueño. El reclamo es
 * atómico (`verificada → consumiendo` en un solo UPDATE): dos envíos a la vez
 * no crean dos negocios. Si el alta falla, la invitación vuelve a «verificada».
 */
export async function completarInvitacion(
  token: string,
  datos: { codigo: string; nombre: string; username: string; password: string },
  req?: Request
): Promise<ResultadoCompletar> {
  if (!usernameValido(datos.username)) return { ok: false, motivo: "usuario_invalido" };
  const db = getDb();
  const [inv] = await db
    .update(schema.businessInvitation)
    .set({ status: "consumiendo", updatedAt: new Date() })
    .where(
      and(
        eq(schema.businessInvitation.tokenHash, hash(token)),
        eq(schema.businessInvitation.codeHash, hash(datos.codigo)),
        eq(schema.businessInvitation.status, "verificada"),
        gt(schema.businessInvitation.expiresAt, new Date())
      )
    )
    .returning();
  if (!inv || !inv.email || !inv.businessName) return { ok: false, motivo: "invalida" };

  const volver = () =>
    db
      .update(schema.businessInvitation)
      .set({ status: "verificada", updatedAt: new Date() })
      .where(eq(schema.businessInvitation.id, inv.id));

  try {
    const r = await crearTenant({
      name: inv.businessName,
      slug: await slugLibre(inv.businessName),
      owner: { name: datos.nombre.trim(), email: inv.email, username: datos.username.trim(), password: datos.password },
    });
    if (!r.ok) {
      await volver();
      if (r.motivo === "usuario_ocupado" || r.motivo === "correo_ocupado") return { ok: false, motivo: r.motivo };
      return { ok: false, motivo: "cuenta", detalle: r.detalle ?? r.motivo };
    }
    // El correo ya se verificó con el enlace de la invitación.
    await db
      .update(schema.user)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(schema.user.email, inv.email));
    await db
      .update(schema.businessInvitation)
      .set({ status: "usada", usedAt: new Date(), organizationId: r.organizationId, codeHash: null, updatedAt: new Date() })
      .where(eq(schema.businessInvitation.id, inv.id));
    await registrarAuditoria({
      action: "invitacion.usada",
      organizationId: r.organizationId,
      target: { type: "invitation", id: inv.id },
      detail: { slug: r.slug },
      req,
    });
    return { ok: true, slug: r.slug, username: datos.username.trim(), organizationId: r.organizationId };
  } catch (err) {
    await volver();
    throw err;
  }
}
