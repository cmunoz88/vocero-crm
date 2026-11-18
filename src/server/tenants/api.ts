import { apiError } from "@/lib/api";
import { superadminActual, type Superadmin } from "@/server/tenants/superadmin";

/**
 * 067 — Envuelve las rutas `/api/admin/*`: sin superusuario responde 404 (la
 * superficie no existe para nadie más, ni siquiera se confirma que existe).
 */
export function withSuperadmin<Args extends unknown[]>(
  handler: (admin: Superadmin, ...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const admin = await superadminActual();
    if (!admin) return apiError(404, "not_found", "No encontrado");
    try {
      return await handler(admin, ...args);
    } catch (err) {
      console.error("[admin] error no controlado:", err);
      return apiError(500, "internal", "Error interno");
    }
  };
}

export const MENSAJES_SLUG: Record<string, string> = {
  formato:
    "El web ID va en minúsculas, números y guiones (3 a 40 caracteres, sin empezar ni terminar en guion).",
  reservado: "Ese web ID está reservado: elige otro.",
  slug_ocupado: "Ya existe un negocio con ese web ID.",
  correo_ocupado: "Ya existe una cuenta con ese correo.",
  no_encontrado: "Ese negocio no existe.",
};
