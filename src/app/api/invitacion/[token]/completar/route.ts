import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { completarInvitacion } from "@/server/platform/invitaciones";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  codigo: z.string().min(1).max(128),
  nombre: z.string().trim().min(1).max(120),
  username: z.string().trim().min(3).max(30),
  password: z.string().min(8).max(128),
});

const MENSAJES = {
  invalida: "Esta invitación ya no es válida (venció, se usó o falta verificar el correo).",
  usuario_invalido: "Usuario inválido: 3 a 30 letras, números, _ o punto.",
  usuario_ocupado: "Ese usuario ya lo usa otra cuenta: elige otro.",
  correo_ocupado: "Ese correo ya tiene una cuenta.",
  cuenta: "No se pudo crear la cuenta.",
} as const;

/** 068 — Paso 3 (público): usuario + contraseña → se crean negocio, cuenta y dueño. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!checkRateLimit(`inv-completar:${clientIp(req.headers)}`, { windowMs: 15 * 60_000, max: 10 }).allowed) {
    return apiError(429, "rate_limited", "Demasiados intentos. Espera unos minutos.");
  }
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return apiError(422, "invalid_body", "Revisa los datos: usuario de 3 a 30 y contraseña de 8 o más.");
  const r = await completarInvitacion(token, body.data, req);
  if (r.ok) return Response.json(r, { status: 201 });
  const status = r.motivo === "invalida" ? 410 : r.motivo === "usuario_invalido" ? 422 : 409;
  return apiError(status, r.motivo, MENSAJES[r.motivo]);
}
