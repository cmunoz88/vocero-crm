# Spec 067 — Multi-tenant con superusuario

**Estado**: en curso · **Rama**: `feat/067-multi-tenant`

Vocero nació como «una instancia = un negocio». Esta instancia (fork
`cmunoz88/vocero-crm`) la opera una agencia que aloja a varios negocios. Los
datos ya estaban separados por `organization_id` (Constitución III, 31 tablas
con FK en cascada); lo que faltaba era la operación: alta, URL propia,
cerebro por negocio, suspensión y borrado.

## Decisiones del dueño (2026-11-17)

1. **Web ID por ruta**: cada tenant entra por `/t/{slug}` (login con su marca).
2. **Solo el superusuario crea tenants** (con la cuenta del dueño); el
   registro público sigue cerrado.
3. **Cerebro por tenant**: URL de despacho, URL de salud y llave del bot
   (`BOT_API_KEY`) propias, cifradas. `/api/bot/*` identifica al tenant por la
   llave. Las variables de entorno siguen valiendo para la organización
   principal (la más antigua) — compatibilidad hacia atrás.
4. **Suspender, luego borrar**: suspender bloquea el acceso, la ingesta de
   WhatsApp y el despacho, y es reversible. Borrar es definitivo, exige
   escribir el web ID y borra datos, archivos y usuarios sin otra membresía.

## Superusuario

Variable `SUPERADMIN_EMAILS` (correos separados por coma). Un superusuario
entra por `/login` y ve **Administración** (`/admin`). No necesita membresía
en ningún tenant. Sin la variable, `/admin` y `/api/admin/*` responden 404.

## Criterios de aceptación

- CA-1 Un no-superusuario recibe 404 en `/admin` y `/api/admin/*`.
- CA-2 El superusuario crea un tenant (nombre, web ID, dueño con correo y
  contraseña temporal); queda sembrado (pipeline + perfil del agente) y el
  dueño entra por `/t/{slug}/login` y ve SOLO los datos de su tenant.
- CA-3 Web ID: `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`, único, palabras
  reservadas rechazadas (422/409).
- CA-4 `/t/{slug}/login` con la cuenta de OTRO tenant: no entra, con mensaje
  claro. `/t/{slug-inexistente}` → 404.
- CA-5 Suspender: el dueño no puede usar la app ni la API (401), el webhook
  de WhatsApp de su número se descarta (200 a Meta, sin ingesta), su llave del
  bot da 401 y no se despacha. Reactivar devuelve todo.
- CA-6 Borrar exige `confirm == slug` y que esté suspendido; tras borrar no
  queda ninguna fila con su `organization_id`, ni `MEDIA_DIR/{orgId}`, ni
  usuarios sin membresía (salvo superusuarios). La organización principal no
  se puede borrar si es la del superusuario actual.
- CA-7 Cerebro por tenant: el superusuario guarda URL de despacho y genera
  llave (se muestra una vez); `/api/bot/context` con esa llave opera sobre ESE
  tenant; la llave de otro tenant no ve sus conversaciones.
- CA-8 La organización principal sigue funcionando igual con las variables
  de entorno (sin regresión).

## Fuera de alcance

Subdominios, facturación, «entrar como» (impersonación), registro público,
borrado de archivos en modo `MEDIA_STORE=bucket` (se reporta como pendiente).
