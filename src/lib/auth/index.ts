import { AsyncLocalStorage } from "node:async_hooks";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, username } from "better-auth/plugins";
import { getDb, schema } from "@/lib/db";
import { getEnv, isMockEnabled } from "@/lib/env";
import { AUTH_RATE_LIMIT, checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  onUserCreated,
  resolveActiveOrganizationId,
} from "@/server/auth/on-signup";
import { isPublicSignupAllowed } from "@/server/auth/registration";
import { correoConEnlace, enviarCorreo } from "@/server/email";
import { baseDeUsername, usernameLibre, USERNAME_MAX, USERNAME_MIN } from "@/server/platform/usernames";

/**
 * Contexto interno del proceso: permite que el alta de cuentas de equipo
 * (owner → API) atraviese el gate de registro cerrado. No es alcanzable
 * desde fuera: solo envuelve llamadas server-side.
 */
const globalForSignup = globalThis as unknown as {
  __voceroInternalSignup?: AsyncLocalStorage<boolean>;
};

// En globalThis: los módulos pueden evaluarse más de una vez (una por ruta en
// dev) y todas las copias deben compartir el mismo contexto.
function internalSignupContext(): AsyncLocalStorage<boolean> {
  if (!globalForSignup.__voceroInternalSignup) {
    globalForSignup.__voceroInternalSignup = new AsyncLocalStorage<boolean>();
  }
  return globalForSignup.__voceroInternalSignup;
}

export function runInternalSignup<T>(fn: () => Promise<T>): Promise<T> {
  return internalSignupContext().run(true, fn);
}

function isInternalSignup(): boolean {
  return internalSignupContext().getStore() === true;
}

const RATE_LIMITED_PATHS = new Set([
  "/sign-in/email",
  "/sign-in/username",
  "/sign-up/email",
  "/reset-password",
  "/change-password",
]);

/**
 * 068 — Rutas de Better Auth que NO se exponen por HTTP: solo se usan desde
 * el servidor (`auth.api.*`), detrás de rutas propias que no revelan si una
 * cuenta existe (`/api/cuenta/olvide`, `/api/cuenta/verificar-correo`).
 */
const SOLO_INTERNAS = new Set([
  "/request-password-reset",
  "/forget-password",
  "/send-verification-email",
  "/is-username-available",
  "/change-email",
]);

function createAuth() {
  const env = getEnv();
  return betterAuth({
    baseURL: env.APP_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      // 068 — Recuperación: enlace de un solo uso, 1 hora, cierra las sesiones.
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await enviarCorreo(
          correoConEnlace({
            para: user.email,
            asunto: "Restablece tu contraseña",
            saludo: `Hola ${user.name}:`,
            cuerpo: "Alguien (ojalá tú) pidió restablecer la contraseña de tu cuenta. El enlace sirve una sola vez y vence en una hora.",
            boton: "Elegir una contraseña nueva",
            url,
            pie: "Si no fuiste tú, ignora este correo: tu contraseña no cambia.",
          })
        );
      },
    },
    emailVerification: {
      expiresIn: 24 * 60 * 60,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        await enviarCorreo(
          correoConEnlace({
            para: user.email,
            asunto: "Confirma tu correo",
            saludo: `Hola ${user.name}:`,
            cuerpo: "Confirma que este correo es tuyo: con él podrás recuperar el acceso si olvidas tu contraseña.",
            boton: "Confirmar mi correo",
            url,
            pie: "Si no pediste esto, ignora este correo.",
          })
        );
      },
    },
    // 068 — Los tokens de un solo uso (restablecer contraseña) se guardan con
    // hash: quien lea la base no puede usarlos.
    verification: { storeIdentifier: "hashed" },
    plugins: [
      organization({ creatorRole: "owner" }),
      username({ minUsernameLength: USERNAME_MIN, maxUsernameLength: USERNAME_MAX }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // 068 — Se entra con usuario. El login por correo solo existe en el
        // entorno de pruebas (los E2E lo usan); en producción, 404.
        if (ctx.path === "/sign-in/email" && !isMockEnabled()) {
          throw new APIError("NOT_FOUND", { message: "Entra con tu nombre de usuario" });
        }
        if (SOLO_INTERNAS.has(ctx.path) && ctx.request) {
          throw new APIError("NOT_FOUND");
        }
        // Rate limit por IP en login/registro (FR-062): 10 / 10 min → 429.
        if (RATE_LIMITED_PATHS.has(ctx.path)) {
          const ip = clientIp(ctx.headers);
          const result = checkRateLimit(`${ctx.path}:${ip}`, AUTH_RATE_LIMIT);
          if (!result.allowed) {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Demasiados intentos; espera unos minutos",
            });
          }
        }
        // Registro público cerrado tras la primera organización (FR-060).
        if (ctx.path === "/sign-up/email") {
          if (!isInternalSignup() && !(await isPublicSignupAllowed())) {
            throw new APIError("FORBIDDEN", {
              message:
                "El registro está cerrado: esta instancia ya tiene su organización",
            });
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // 068 — Toda cuenta tiene usuario: si el alta no trae uno (registro
          // inicial, equipo), se deriva del correo («ana.lopez», «ana.lopez2»…).
          before: async (user) => {
            const u = user as typeof user & { username?: string | null; displayUsername?: string | null };
            if (u.username) return { data: user };
            const username = await usernameLibre(baseDeUsername(u.email));
            return { data: { ...user, username, displayUsername: username } };
          },
          after: async (user) => {
            await onUserCreated(user.id, user.name);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const organizationId = await resolveActiveOrganizationId(
              session.userId
            );
            return {
              data: { ...session, activeOrganizationId: organizationId },
            };
          },
        },
      },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __voceroAuth?: Auth };

export function getAuth(): Auth {
  if (!globalForAuth.__voceroAuth) globalForAuth.__voceroAuth = createAuth();
  return globalForAuth.__voceroAuth;
}
