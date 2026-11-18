import { and, eq, isNotNull } from "drizzle-orm";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { superadminEmails } from "@/server/tenants/superadmin";

/**
 * 067 — Rescate de acceso del superusuario.
 *
 * Con `SUPERADMIN_SET_PASSWORD` definida, al arrancar: a cada correo de
 * `SUPERADMIN_EMAILS` sin cuenta se le crea una (sin negocio: su casa es
 * /admin), y a la que ya existe se le pone esa contraseña. Es una llave de
 * emergencia: se define, se reinicia, se entra, se cambia la contraseña en
 * /cuenta y se QUITA la variable (mientras esté, cada arranque la vuelve a
 * poner). Con `SUPERADMIN_SET_PASSWORD_FOR` solo se aplica a esos correos. La
 * contraseña jamás se escribe en logs.
 */
export async function aplicarPasswordSuperadmin(
  env: Record<string, string | undefined> = process.env
): Promise<void> {
  const password = env.SUPERADMIN_SET_PASSWORD;
  if (!password) return;
  if (password.length < 8) {
    console.error("[boot] SUPERADMIN_SET_PASSWORD mide menos de 8 caracteres: se ignora.");
    return;
  }
  // `SUPERADMIN_SET_PASSWORD_FOR` limita el rescate a esos correos (que deben
  // ser superusuarios): así no se pisa la contraseña de los demás.
  const solo = superadminEmails({ SUPERADMIN_EMAILS: env.SUPERADMIN_SET_PASSWORD_FOR });
  const emails = [...superadminEmails(env)].filter((e) => solo.size === 0 || solo.has(e));
  if (emails.length === 0) {
    console.error("[boot] SUPERADMIN_SET_PASSWORD sin SUPERADMIN_EMAILS: no hay a quién aplicarla.");
    return;
  }
  const auth = getAuth();
  const ctx = await auth.$context;
  const db = getDb();
  for (const email of emails) {
    try {
      const [user] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.email, email))
        .limit(1);
      if (!user) {
        await runInternalSignup(() =>
          auth.api.signUpEmail({ body: { email, password, name: email.split("@")[0] ?? "Superusuario" } })
        );
        console.warn(`[boot] cuenta de superusuario creada para ${email} (SUPERADMIN_SET_PASSWORD): cámbiala en /cuenta y quita la variable`);
        continue;
      }
      const hash = await ctx.password.hash(password);
      const [cred] = await db
        .select({ id: schema.account.id })
        .from(schema.account)
        .where(
          and(
            eq(schema.account.userId, user.id),
            eq(schema.account.providerId, "credential"),
            isNotNull(schema.account.password)
          )
        )
        .limit(1);
      if (cred) {
        await ctx.internalAdapter.updatePassword(user.id, hash);
      } else {
        await ctx.internalAdapter.linkAccount({
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: hash,
        });
      }
      console.warn(`[boot] contraseña de superusuario restablecida para ${email} (SUPERADMIN_SET_PASSWORD): cámbiala en /cuenta y quita la variable`);
    } catch (err) {
      console.error(`[boot] no se pudo aplicar SUPERADMIN_SET_PASSWORD a ${email}:`, err instanceof Error ? err.message : err);
    }
  }
}

/** 067 — ¿Algún negocio tiene su propio cerebro? Entonces el worker arranca aunque el entorno no tenga uno. */
export async function hayCerebrosPorNegocio(): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: schema.brainConnection.id })
    .from(schema.brainConnection)
    .where(isNotNull(schema.brainConnection.dispatchUrl))
    .limit(1);
  return Boolean(row);
}
