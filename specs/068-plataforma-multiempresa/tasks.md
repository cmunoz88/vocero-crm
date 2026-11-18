# 068 — Tareas

## Etapa 1 — Acceso
- [x] T101 Esquema: `user.username`/`display_username`/`platform_role`, `audit_log`, `one_time_secret` (migración 0028, idempotente)
- [x] T102 Better Auth: plugin `username`; `/sign-in/email` y `/request-password-reset` HTTP solo con mocks; identificadores de verificación con hash; reset 1 h, revoca sesiones
- [x] T103 Usernames para cuentas existentes (arranque) y para altas sin usuario (hook)
- [x] T104 Conector de correo SMTP opcional (`src/server/email/`) + buzón mock para E2E
- [x] T105 Superadmin por rol en la base (`superadmin.ts` y sus usos)
- [x] T106 Optimus al arrancar + `/setup/credenciales` (una sola vista)
- [x] T107 UI: login por usuario, «¿Olvidaste tu contraseña?», `/restablecer`, `/cuenta` (usuario, verificar correo), alta en /admin y equipo con usuario
- [x] T108 /admin/usuarios: lista, borrar, enlace de restablecimiento copiable
- [x] T109 Bitácora en acciones administrativas
- [x] T110 E2E `scripts/e2e-acceso.mjs` + regresión multi-tenant y cuenta
- [ ] T111 Deploy + borrar maestra@ y cesar@

## Etapa 2 — Invitaciones
- [ ] T201 `business_invitation` + servicio (crear, revocar, solicitar, verificar, completar con reclamo atómico)
- [ ] T202 UI /admin «Invitar negocio» + páginas públicas `/invitacion/[token]`
- [ ] T203 E2E (vencida, un solo uso, carrera, sin correo)

## Etapa 3 — Números y agentes
- [ ] T301 Varios `meta_credentials` por negocio (+ `label`, `agent_id`)
- [ ] T302 `conversation.wa_phone_number_id` + envío por el número de la conversación
- [ ] T303 Varios `agent_profile` (+ `name`, `is_default`) y modo compartido/por número
- [ ] T304 Despacho y `/api/bot/profile` con el agente de la conversación
- [ ] T305 UI Ajustes → WhatsApp (lista) y Agentes (lista)
- [ ] T306 E2E

## Etapa 4 — Panel global
- [ ] T401 Estadísticas por negocio e integraciones
- [ ] T402 IA por negocio (apagar/encender) desde /admin
- [ ] T403 Llave fija de OpenRouter + modelos autorizados por el superadmin
- [ ] T404 E2E + deploy
