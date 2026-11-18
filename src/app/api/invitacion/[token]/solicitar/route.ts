import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { solicitarInvitacion } from "@/server/platform/invitaciones";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  negocio: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
});

/** 068 — Paso 1 (público, con el enlace): nombre del negocio + correo → verificación. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!checkRateLimit(`inv-solicitar:${clientIp(req.headers)}`, { windowMs: 15 * 60_000, max: 10 }).allowed) {
    return apiError(429, "rate_limited", "Demasiados intentos. Espera unos minutos.");
  }
  if (!checkRateLimit(`inv-solicitar-token:${token.slice(0, 64)}`, { windowMs: 60 * 60_000, max: 5 }).allowed) {
    return apiError(429, "rate_limited", "Ya pediste varios correos. Espera un rato.");
  }
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return apiError(422, "invalid_body", "Escribe el nombre del negocio y un correo válido.");
  const r = await solicitarInvitacion(token, body.data, req);
  if (r.ok) return Response.json(r);
  if (r.motivo === "correo_ocupado") return apiError(409, r.motivo, "Ese correo ya tiene una cuenta. Usa otro.");
  if (r.motivo === "ya_verificada") return apiError(409, r.motivo, "Este correo ya se verificó: abre el enlace del correo para terminar.");
  return apiError(410, "invalida", "Esta invitación ya no es válida (venció, se usó o se revocó).");
}
