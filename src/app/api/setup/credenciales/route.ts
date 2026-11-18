import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { revelacionHabilitada, revelarCredenciales } from "@/server/platform/optimus";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ token: z.string().min(1).max(512) });

/**
 * 068 — Muestra UNA vez la contraseña inicial del superadministrador. Sin
 * `SETUP_REVEAL_TOKEN` (32+) la ruta no existe (404). La respuesta no se
 * guarda en caché.
 */
export async function POST(req: Request) {
  if (!revelacionHabilitada()) return apiError(404, "not_found", "No encontrado");
  if (!checkRateLimit(`setup-reveal:${clientIp(req.headers)}`, { windowMs: 15 * 60_000, max: 5 }).allowed) {
    return apiError(429, "rate_limited", "Demasiados intentos. Espera unos minutos.");
  }
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return apiError(422, "invalid_body", "Falta la llave.");
  const r = await revelarCredenciales(body.data.token);
  const sinCache = { "cache-control": "no-store" };
  if (r.ok) return Response.json({ username: r.username, password: r.password }, { headers: sinCache });
  if (r.motivo === "token") return apiError(403, "token", "Esa llave no es correcta.");
  if (r.motivo === "vencido") return apiError(410, "vencido", "La contraseña inicial venció. Usa SUPERADMIN_ROTATE_PASSWORD=true para generar otra.");
  return apiError(410, "nada", "No hay nada que mostrar: ya se vio (o nunca se generó).");
}
