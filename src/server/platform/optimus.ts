import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { registrarAuditoria } from "@/server/platform/audit";
import { normalizarUsername, usernameValido } from "@/server/platform/usernames";

/**
 * 068 — El superadministrador de la plataforma (por defecto «Optimus»).
 *
 * Al arrancar, si no hay ninguno, se crea con una contraseña aleatoria (o se
 * convierte la cuenta que ya tenga ese usuario o ese correo). La contraseña:
 *   - se guarda como hash (scrypt, el de Better Auth);
 *   - se guarda además CIFRADA (AES-256-GCM) en `one_time_secret` para verse
 *     UNA sola vez en /setup/credenciales con `SETUP_REVEAL_TOKEN`; al verse
 *     (o al vencer, 7 días) se borra;
 *   - jamás se escribe en logs ni en archivos.
 * Re-ejecutable: con un superadministrador ya creado no hace nada (salvo el
 * rescate `SUPERADMIN_ROTATE_PASSWORD=true`).
 */

export const PROPOSITO = "superadmin_inicial";
const VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000;
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Contraseña de 20 caracteres (≈114 bits) con un generador criptográfico. */
export function generarPassword(largo = 20): string {
  let out = "";
  for (let i = 0; i < largo; i++) out += ALFABETO[randomInt(ALFABETO.length)];
  return out;
}

type Env = Record<string, string | undefined>;

async function fijarPassword(userId: string, password: string): Promise<void> {
  const ctx = await getAuth().$context;
  const hash = await ctx.password.hash(password);
  const db = getDb();
  const [cred] = await db
    .select({ id: schema.account.id })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")))
    .limit(1);
  if (cred) {
    await db
      .update(schema.account)
      .set({ password: hash, updatedAt: new Date() })
      .where(eq(schema.account.id, cred.id));
  } else {
    await db.insert(schema.account).values({
      id: randomBytes(16).toString("hex"),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hash,
    });
  }
  // Una contraseña nueva cierra las sesiones abiertas de esa cuenta.
  await db.delete(schema.session).where(eq(schema.session.userId, userId));
}

async function guardarSecreto(password: string): Promise<void> {
  const enc = encryptSecret(password);
  const expiresAt = new Date(Date.now() + VIGENCIA_MS);
  await getDb()
    .insert(schema.oneTimeSecret)
    .values({ id: newId("oneTimeSecret"), purpose: PROPOSITO, ...enc, expiresAt })
    .onConflictDoUpdate({
      target: schema.oneTimeSecret.purpose,
      set: { ...enc, expiresAt, createdAt: new Date() },
    });
}

async function haySecretoPendiente(): Promise<boolean> {
  const [row] = await getDb()
    .select({ expiresAt: schema.oneTimeSecret.expiresAt })
    .from(schema.oneTimeSecret)
    .where(eq(schema.oneTimeSecret.purpose, PROPOSITO))
    .limit(1);
  return Boolean(row && row.expiresAt.getTime() > Date.now());
}

export type ResultadoOptimus = "existe" | "creado" | "convertido" | "rotado" | "sin_correo" | "usuario_invalido";

export async function asegurarSuperadmin(env: Env = process.env): Promise<ResultadoOptimus> {
  const db = getDb();
  const display = (env.SUPERADMIN_USERNAME ?? "Optimus").trim();
  if (!usernameValido(display)) {
    console.error("[boot] SUPERADMIN_USERNAME no es un usuario válido (3-30: letras, números, _ y .).");
    return "usuario_invalido";
  }
  const username = normalizarUsername(display);

  const [actual] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.platformRole, "superadmin"))
    .limit(1);
  if (actual) {
    if (env.SUPERADMIN_ROTATE_PASSWORD === "true" && !(await haySecretoPendiente())) {
      const password = generarPassword();
      await fijarPassword(actual.id, password);
      await guardarSecreto(password);
      await registrarAuditoria({ action: "superadmin.password_rotada", target: { type: "user", id: actual.id } });
      console.warn("[boot] contraseña del superadministrador regenerada (SUPERADMIN_ROTATE_PASSWORD): se ve UNA vez en /setup/credenciales. Quita la variable.");
      return "rotado";
    }
    return "existe";
  }

  const email = env.SUPERADMIN_RECOVERY_EMAIL?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.warn("[boot] no hay superadministrador: define SUPERADMIN_RECOVERY_EMAIL para crearlo.");
    return "sin_correo";
  }

  const password = generarPassword();
  const [previo] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(or(eq(schema.user.username, username), eq(schema.user.email, email)))
    .limit(1);

  let userId: string;
  let resultado: ResultadoOptimus;
  if (previo) {
    userId = previo.id;
    // Si otro usuario ya tiene el correo (y no es esta cuenta), no se toca.
    const [conCorreo] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1);
    await db
      .update(schema.user)
      .set({
        username,
        displayUsername: display,
        platformRole: "superadmin",
        ...(conCorreo && conCorreo.id !== userId ? {} : { email, emailVerified: true }),
        updatedAt: new Date(),
      })
      .where(eq(schema.user.id, userId));
    resultado = "convertido";
  } else {
    // Directo en la base y no por el registro: así no dispara el hook que, en
    // una instalación vacía, le crearía un negocio propio.
    userId = randomBytes(16).toString("hex");
    await db.insert(schema.user).values({
      id: userId,
      name: display,
      email,
      emailVerified: true,
      username,
      displayUsername: display,
      platformRole: "superadmin",
    });
    resultado = "creado";
  }
  await fijarPassword(userId, password);
  await guardarSecreto(password);
  await registrarAuditoria({
    action: resultado === "creado" ? "superadmin.creado" : "superadmin.convertido",
    target: { type: "user", id: userId },
    detail: { username: display },
  });
  console.warn(
    `[boot] superadministrador «${display}» ${resultado}: su contraseña inicial se ve UNA vez en /setup/credenciales (con SETUP_REVEAL_TOKEN).`
  );
  return resultado;
}

/** ¿Está habilitada la vista única? (token de 32+ caracteres en el entorno) */
export function revelacionHabilitada(env: Env = process.env): boolean {
  return (env.SETUP_REVEAL_TOKEN?.trim().length ?? 0) >= 32;
}

function mismoToken(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type Revelacion =
  | { ok: true; username: string; password: string }
  | { ok: false; motivo: "deshabilitado" | "token" | "nada" | "vencido" };

/** Muestra la contraseña inicial UNA vez y la borra. */
export async function revelarCredenciales(token: string, env: Env = process.env): Promise<Revelacion> {
  if (!revelacionHabilitada(env)) return { ok: false, motivo: "deshabilitado" };
  if (!mismoToken(token.trim(), env.SETUP_REVEAL_TOKEN!.trim())) return { ok: false, motivo: "token" };
  const db = getDb();
  // Borrar y devolver en un solo paso: dos pestañas a la vez no la ven dos veces.
  const [row] = await db
    .delete(schema.oneTimeSecret)
    .where(eq(schema.oneTimeSecret.purpose, PROPOSITO))
    .returning();
  if (!row) return { ok: false, motivo: "nada" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, motivo: "vencido" };
  const [su] = await db
    .select({ username: schema.user.displayUsername, id: schema.user.id })
    .from(schema.user)
    .where(and(eq(schema.user.platformRole, "superadmin"), isNotNull(schema.user.username)))
    .limit(1);
  await registrarAuditoria({ action: "superadmin.credenciales_vistas", target: su ? { type: "user", id: su.id } : null });
  return { ok: true, username: su?.username ?? "Optimus", password: decryptSecret(row) };
}
