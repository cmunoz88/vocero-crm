# 068 — Plataforma multiempresa (Optimus, invitaciones, varios números y agentes)

Extiende 067. Mismo monolito, sin servicios nuevos salvo el **conector de
correo opcional (SMTP)**, aprobado por el dueño (Gmail / Google Workspace).

## Decisiones del dueño (2026-11-18)

- Un solo superadministrador global, **Optimus** (rol `superadmin` en la base,
  ya no `SUPERADMIN_EMAILS`). Correo de recuperación: el de
  `SUPERADMIN_RECOVERY_EMAIL`. Contraseña aleatoria, vista **una vez** en
  `/setup/credenciales` con `SETUP_REVEAL_TOKEN`; jamás en logs ni en git.
  Se borran las cuentas de superusuario anteriores (maestra@ y cesar@).
- Se entra **solo con nombre de usuario** + contraseña (único, sin distinguir
  mayúsculas). El correo es contacto y recuperación. `/sign-in/email` solo
  existe en el entorno de pruebas (mocks), nunca en producción.
- «¿Olvidaste tu contraseña?» por nombre de usuario → enlace al correo
  **verificado**; respuesta uniforme (no revela si existe), límite de intentos,
  token de un solo uso con vencimiento (guardado con hash).
- Hash: se queda **scrypt** (Better Auth); sin Argon2id.
- Negocios por **invitación**: el superadmin genera un enlace único (vence,
  un solo uso, token con hash); el cliente pone nombre del negocio y correo,
  verifica el correo, elige usuario y contraseña → se crean negocio, cuenta y
  membresía `owner` en un solo paso. Solo el superadmin crea negocios (también
  sigue el alta directa de 067).
- Varios números de WhatsApp por negocio, cada uno con su agente (modo
  «compartido» o «por número»). Varios agentes por negocio.
- Una sola llave de OpenRouter para todos (la del entorno, fija). El modelo
  lo elige cada agente de una lista que autoriza el superadmin.
- El superadmin puede apagar la IA de un negocio; el dueño puede volver a
  encenderla.
- Cerebro: un Nea compartido, conectado a cada negocio con su llave.

## Etapas

1. Login con usuario, rol superadmin en base, Optimus, recuperación por correo,
   conector SMTP, bitácora, usuarios en /admin.
2. Invitaciones de negocio.
3. Varios números y varios agentes por negocio.
4. Panel global: estadísticas, integraciones, IA por negocio, modelos
   autorizados, llave fija de OpenRouter.

Ver `tasks.md`.
