import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

/**
 * 067 — Quién es superusuario: los correos de `SUPERADMIN_EMAILS` (separados
 * por coma, sin distinguir mayúsculas). No vive en la base a propósito: no hay
 * pantalla ni API que pueda convertir a alguien en superusuario, solo quien
 * controla el despliegue.
 */
export function superadminEmails(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env.SUPERADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@"))
  );
}

export function esSuperadmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return superadminEmails().has(email.trim().toLowerCase());
}

export type Superadmin = { userId: string; email: string; name: string };

/** El superusuario de la sesión actual, o `null` (sin sesión o no lo es). */
export async function superadminActual(): Promise<Superadmin | null> {
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (!session || !esSuperadmin(session.user.email)) return null;
    return { userId: session.user.id, email: session.user.email, name: session.user.name };
  } catch {
    return null;
  }
}
