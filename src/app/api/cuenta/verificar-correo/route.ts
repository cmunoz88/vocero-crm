import { headers } from "next/headers";
import { apiError } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { correoHabilitado } from "@/server/email";

export const dynamic = "force-dynamic";

/** 068 — Manda a MI correo el enlace para verificarlo (solo con sesión). */
export async function POST() {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  if (!session) return apiError(401, "unauthorized", "No autenticado");
  if (session.user.emailVerified) return Response.json({ ok: true, yaVerificado: true });
  if (!correoHabilitado()) {
    return apiError(503, "sin_correo", "Esta instalación todavía no envía correos. Pídele al administrador que configure el SMTP.");
  }
  if (!checkRateLimit(`verificar:${session.user.id}`, { windowMs: 60 * 60_000, max: 5 }).allowed) {
    return apiError(429, "rate_limited", "Ya te mandamos varios. Revisa tu bandeja (y el spam) o espera un rato.");
  }
  await auth.api.sendVerificationEmail({
    body: { email: session.user.email, callbackURL: `${getEnv().APP_BASE_URL}/cuenta?verificado=1` },
  });
  return Response.json({ ok: true });
}
