import { headers } from "next/headers";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { esSuperadmin } from "@/server/tenants/superadmin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

/**
 * 067 — Cambiar el propio correo (el que se usa para entrar). Pide la
 * contraseña: con solo una sesión abierta nadie se queda con la cuenta.
 *
 * Un superusuario no puede cambiarse a un correo fuera de
 * `SUPERADMIN_EMAILS`: perdería /admin sin darse cuenta (ser superusuario va
 * por correo, a propósito, y solo lo cambia quien controla el despliegue).
 */
export async function POST(req: Request) {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  if (!session) return apiError(401, "unauthorized", "No autenticado");

  const rl = checkRateLimit(`cuenta-email:${session.user.id}`, { windowMs: 10 * 60_000, max: 10 });
  if (!rl.allowed) return apiError(429, "rate_limited", "Demasiados intentos. Espera unos minutos.");

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return apiError(422, "invalid_body", "Escribe un correo válido.");
  const { email, password } = body.data;
  const actual = session.user.email.toLowerCase();
  if (email === actual) return apiError(422, "mismo", "Ese ya es tu correo.");

  if (esSuperadmin(actual) && !esSuperadmin(email)) {
    return apiError(
      409,
      "superadmin",
      "Eres superusuario y eso va por correo: el nuevo tiene que estar en SUPERADMIN_EMAILS antes de cambiarlo, o perderías el acceso a Negocios."
    );
  }

  const db = getDb();
  const [cred] = await db
    .select({ hash: schema.account.password })
    .from(schema.account)
    .where(
      and(
        eq(schema.account.userId, session.user.id),
        eq(schema.account.providerId, "credential"),
        isNotNull(schema.account.password)
      )
    )
    .limit(1);
  const ctx = await auth.$context;
  if (!cred?.hash || !(await ctx.password.verify({ hash: cred.hash, password }))) {
    return apiError(403, "password", "La contraseña no es correcta.");
  }

  const [ocupado] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(and(eq(schema.user.email, email), ne(schema.user.id, session.user.id)))
    .limit(1);
  if (ocupado) return apiError(409, "ocupado", "Ya existe una cuenta con ese correo.");

  try {
    await db
      .update(schema.user)
      .set({ email, emailVerified: false, updatedAt: new Date() })
      .where(eq(schema.user.id, session.user.id));
  } catch (err) {
    if (/unique|duplicate/i.test(String(err))) {
      return apiError(409, "ocupado", "Ya existe una cuenta con ese correo.");
    }
    throw err;
  }
  return Response.json({ ok: true, email });
}
