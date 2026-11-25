# 069 — Cumplimiento con Meta, Coexistence y Graph v26

**Status**: Implementada. Typecheck, lint, pruebas unitarias y los E2E de 069
(35 checks) y 066 (31) en verde contra la app real y el wa-mock. Sin verificar
contra Meta real (ver «Pendiente»).

**Input**: convertir Vocero en un SaaS para varios negocios con **una sola app
de Meta** (Tech Provider). Para el App Review y el acceso avanzado Meta exige
páginas legales y los callbacks de desautorización y eliminación de datos;
además, quien usa la app WhatsApp Business chocaba con #2494064 al conectar.

**Carril**: ciclo completo. Migración **0032** aditiva y re-ejecutable.

## Historias

### H1 — Páginas públicas

`/privacidad`, `/terminos` y `/eliminar-datos` cargan **sin sesión** y sin
marca de tenant. Las firma `LEGAL_NAME` (por defecto «Vocero») y muestran
`LEGAL_CONTACT_EMAIL` si existe.

### H2 — Desautorización

`POST /api/meta/desautorizar` con `signed_request` válido: las conexiones cuyo
`meta_user_id` coincide pasan a `reconnect_required`. Idempotente. Firma
inválida, formato roto o sin campo: 400 sin tocar nada.

### H3 — Eliminación de datos

`POST /api/meta/eliminar-datos`: borra las conexiones de ese usuario (si un
negocio conserva otras, la más antigua pasa a principal), registra la solicitud
en `meta_data_deletion` y responde `{ url, confirmation_code }`. La página
`/eliminar-datos?codigo=` enseña «completada» o «sin datos» sin revelar el
`user_id`. Repetirla da otro código y «sin datos».

### H4 — Quién autorizó

Al terminar «Conectar con Meta», el servidor consulta `GET /me?fields=id` con
el token del cliente y guarda `meta_credentials.meta_user_id`. Best-effort: si
falla, la conexión se guarda igual.

### H5 — Coexistence

El popup manda siempre `extras.featureType = whatsapp_business_app_onboarding`.
El evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` ya no se rechaza: el
cliente manda `coexistence: true` y el servidor **no** llama a `/register` ni
genera PIN. Los eventos `history`, `smb_app_state_sync` y `account_update` se
ignoran sin error; `smb_message_echoes` ya lo procesaba la spec 008.

### H6 — Graph v26.0

`META_GRAPH_API_VERSION` por defecto `v26.0`; Instagram toma la misma
variable.

## Decisiones

- El `user_id` va en `meta_credentials` (no en una tabla aparte): es un dato de
  la conexión y sale con ella al borrarla.
- `meta_data_deletion` no lleva `organization_id`: es de la plataforma (como
  `audit_log`) y no guarda secretos.
- Las conversaciones y contactos **no** se borran en H3: son del negocio.
- Sin cobro ni planes: la constitución prohíbe billing en el núcleo; si hiciera
  falta, entra como conector opcional con bandera.

## Fuera de alcance

Sincronizar contactos e historial de Coexistence (otra superficie: tabla y
reglas de ingesta). El negocio de revisión (`meta-review`) para grabar los
videos: spec aparte cuando toque el App Review.

## Pendiente

- Pegar las URLs en el panel de Meta y suscribir los campos de Coexistence
  ([docs/cumplimiento-meta.md](../../docs/cumplimiento-meta.md)).
- Probar en vivo con un perfil con rol en la app: el popup, el `user_id` que
  Meta manda en los callbacks y un cliente real de la app WhatsApp Business.
