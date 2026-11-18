import { apiError } from "@/lib/api";
import { registrarAuditoria } from "@/server/platform/audit";
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
      const res = await handler(admin, ...args);
      // 068 — Bitácora: toda acción del superadministrador que cambia algo.
      const req = args[0] instanceof Request ? args[0] : null;
      if (req && req.method !== "GET" && res.ok) {
        const ruta = new URL(req.url).pathname;
        const org = /\/api\/admin\/tenants\/([^/]+)/.exec(ruta)?.[1] ?? null;
        await registrarAuditoria({
          actor: { userId: admin.userId, label: admin.username },
          action: `admin ${req.method} ${ruta.replace(/^\/api\/admin/, "")}`,
          organizationId: org,
          req,
        });
      }
      return res;
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
  usuario_ocupado: "Ese nombre de usuario ya lo usa otra cuenta.",
  no_encontrado: "Ese negocio no existe.",
};
