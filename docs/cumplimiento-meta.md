# Cumplimiento con Meta (spec 069)

Lo que Meta exige para aprobar la app (App Review y acceso avanzado) y cómo lo
cumple Vocero. Todo es de la **instancia**: una sola app de Meta sirve a todos
los negocios.

## Variables

| Variable | Para qué |
|---|---|
| `LEGAL_NAME` | Quién firma las páginas públicas (razón social o nombre comercial). Sin ella: «Vocero» |
| `LEGAL_CONTACT_EMAIL` | Correo de privacidad que enseñan las páginas. Sin él no se muestra ninguno |
| `META_GRAPH_API_VERSION` | `v26.0` por defecto. Una sola variable para toda la Graph API |

## URLs para el panel de la app de Meta

Con `APP_BASE_URL=https://crm.tudominio.com`:

| Dónde en el panel de Meta | Valor |
|---|---|
| Configuración → Básica → **URL de la política de privacidad** | `https://crm.tudominio.com/privacidad` |
| Configuración → Básica → **URL de las condiciones del servicio** | `https://crm.tudominio.com/terminos` |
| Configuración → Básica → **Eliminación de datos de usuario** → *URL de solicitud de eliminación de datos* | `https://crm.tudominio.com/api/meta/eliminar-datos` |
| Facebook Login for Business → Configuración → **URL de devolución de llamada de desautorización** | `https://crm.tudominio.com/api/meta/desautorizar` |
| Configuración → Básica → Dominios de la app | `crm.tudominio.com` |
| Facebook Login for Business → **Dominios permitidos para el SDK de JavaScript** | `https://crm.tudominio.com` |

Las páginas son públicas (sin login). Los dos callbacks son `POST` de Meta con
un `signed_request` firmado con `META_APP_SECRET`; sin firma válida responden
400 y no tocan nada.

## Qué hace cada callback

- **Desautorización** (alguien quitó la app): las conexiones que esa persona
  autorizó pasan a «reconectar». No se borra nada.
- **Eliminación de datos**: se borran esas conexiones (token cifrado e IDs de
  la cuenta y del número). Meta recibe `{ url, confirmation_code }` y la `url`
  abre `/eliminar-datos?codigo=…`, donde cualquiera con el código ve el estado.
  Las conversaciones y contactos son del negocio, no de quien autorizó.

Meta solo manda el `user_id` de quien autorizó. Vocero lo guarda en
`meta_credentials.meta_user_id` al terminar «Conectar con Meta» (se consulta
con `GET /me?fields=id` y el token del cliente). Las conexiones dadas de alta a
mano con token no tienen ese dato: esos avisos no las encuentran.

## Coexistence (la app WhatsApp Business del teléfono)

El popup manda siempre `featureType: "whatsapp_business_app_onboarding"`, así
que la ventana de Meta deja elegir entre **número nuevo** y **conectar la app
WhatsApp Business**. Con la segunda, Vocero **no** llama a `/register` ni pone
PIN (el número ya vive en la app) y deja la conexión guardada.

Campos de webhook a suscribir en el panel de la app (Webhooks → WhatsApp
Business Account): `messages`, `message_template_status_update`,
`account_update`, `history`, `smb_app_state_sync` y **`smb_message_echoes`**.
Vocero procesa `smb_message_echoes` (lo que el dueño contesta desde el
teléfono entra a la conversación como saliente manual); los demás se reciben y
se ignoran sin error.

Fuera de alcance, a propósito: sincronizar contactos e historial de la app.

## Lo que sigue en el panel de Meta (a mano, una vez)

1. Pegar las URLs de arriba.
2. Suscribir los campos de webhook de Coexistence.
3. Publicar la app. Con la app sin publicar solo llegan webhooks de prueba.
