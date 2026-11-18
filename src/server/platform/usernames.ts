import { eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * 068 — Nombres de usuario: con ellos se entra. Únicos en toda la plataforma
 * y sin distinguir mayúsculas (se guardan en minúsculas; `display_username`
 * conserva cómo se escribió). Las mismas reglas que el validador por defecto
 * del plugin `username` de Better Auth: letras, números, `_` y `.`.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USERNAME_RE = /^[a-zA-Z0-9_.]{3,30}$/;

export function normalizarUsername(u: string): string {
  return u.trim().toLowerCase();
}

export function usernameValido(u: string): boolean {
  return USERNAME_RE.test(u.trim());
}

/** Base razonable a partir de un correo o un nombre: «ana.lopez@x.com» → «ana.lopez». */
export function baseDeUsername(fuente: string): string {
  const local = (fuente.includes("@") ? fuente.split("@")[0] : fuente) ?? "";
  let base = local
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9_.]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "");
  if (base.length < USERNAME_MIN) base = `${base}usuario`.slice(0, 12);
  return base.slice(0, USERNAME_MAX - 4);
}

/** Un usuario libre a partir de una base: «ana», «ana2», «ana3»… */
export async function usernameLibre(base: string): Promise<string> {
  const db = getDb();
  for (let i = 1; i < 500; i++) {
    const candidato = i === 1 ? base : `${base}${i}`;
    const [ocupado] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.username, candidato))
      .limit(1);
    if (!ocupado) return candidato;
  }
  return `${base}${Date.now().toString(36)}`.slice(0, USERNAME_MAX);
}

/**
 * Al arrancar: las cuentas de antes de 068 (que entraban con correo) reciben
 * un usuario derivado de su correo. Re-ejecutable: solo toca las que no tienen.
 */
export async function asignarUsernamesFaltantes(): Promise<number> {
  const db = getDb();
  const sin = await db
    .select({ id: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .where(isNull(schema.user.username));
  for (const u of sin) {
    const username = await usernameLibre(baseDeUsername(u.email));
    await db
      .update(schema.user)
      .set({ username, displayUsername: username })
      .where(eq(schema.user.id, u.id));
  }
  return sin.length;
}
