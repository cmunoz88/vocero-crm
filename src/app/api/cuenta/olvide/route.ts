import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { correoHabilitado } from "@/server/email";
import { registrarAuditoria } from "@/server/platform/audit";
import { normalizarUsername } from "@/server/platform/usernames";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ username: z.string().trim().min(1).max(64) });

/** La misma respuesta exista o no la cuenta: no se revela quién está registrado. */
const RESPUESTA = {
  ok: true,
  message:
    "Si ese usuario existe y tiene un correo verificado, le enviamos un enlace para elegir una contraseña nueva. Vence en una hora.",
};

/**
 * 068 — «¿Olvidaste tu contraseña?» por nombre de usuario. El enlace va al
 * correo VERIFICADO de la cuenta; de un solo uso, 1 hora (Better Auth,
 * identificador guardado con hash). Límite por IP y por usuario.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!checkRateLimit(`olvide:ip:${ip}`, { windowMs: 15 * 60_000, max: 5 }).allowed) {
    return apiError(429, "rate_limited", "Demasiados intentos. Espera unos minutos.");
  }
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return apiError(422, "invalid_body", "Escribe tu nombre de usuario.");
  const username = normalizarUsername(body.data.username);
  // Por usuario, en silencio: no cambia la respuesta (no se distingue nada).
  if (!checkRateLimit(`olvide:user:${username}`, { windowMs: 60 * 60_000, max: 3 }).allowed) {
    return Response.json(RESPUESTA);
  }

  const [user] = await getDb()
    .select({ id: schema.user.id, email: schema.user.email, verificado: schema.user.emailVerified })
    .from(schema.user)
    .where(eq(schema.user.username, username))
    .limit(1);

  if (user?.verificado && correoHabilitado()) {
    try {
      await getAuth().api.requestPasswordReset({
        body: { email: user.email, redirectTo: `${getEnv().APP_BASE_URL}/restablecer` },
      });
    } catch (err) {
      console.error("[olvide] no se pudo pedir el restablecimiento:", err instanceof Error ? err.message : err);
    }
  }
  if (user) {
    await registrarAuditoria({
      action: "password.reset_solicitado",
      target: { type: "user", id: user.id },
      detail: { enviado: Boolean(user.verificado && correoHabilitado()) },
      req,
    });
  }
  return Response.json(RESPUESTA);
}
