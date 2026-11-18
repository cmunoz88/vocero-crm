import { apiError } from "@/lib/api";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { markBotSeen } from "@/server/bot/status";
import { orgDeLlave } from "@/server/brains/por-org";
import { primaryOrgId, resetPrimaryOrgCache } from "@/server/tenants/primary";

/**
 * Autenticación de la API de servicio `/api/bot/*`.
 *
 * Esta superficie NO la consume el navegador: la consume un cerebro externo
 * (un microservicio propio del operador, en su mismo servidor) que quiere
 * conducir la conversación sin que el token de WhatsApp salga del CRM.
 * Header `X-API-Key` (o `Authorization: Bearer`) contra `BOT_API_KEY` (env),
 * comparación en tiempo constante. Sin `BOT_API_KEY` configurada, toda la superficie responde 401.
 *
 * Primero se autentica y DESPUÉS se cuenta. Antes había un solo cubo global
 * contado antes de mirar la key: 600 requests anónimos por minuto dejaban al
 * cerebro en 429 el resto de la ventana, y los clientes sin respuesta.
 */

const MIN_KEY_LENGTH = 16;

/** La superficie está abierta: hay `BOT_API_KEY` y no es débil. Una key
 *  corta equivale a no tenerla (todo responde 401). */
export function isBotKeyConfigured(): boolean {
  const key = process.env.BOT_API_KEY;
  return typeof key === "string" && key.length >= MIN_KEY_LENGTH;
}

/**
 * Presupuesto del cerebro AUTENTICADO: 1200/min (20/s sostenidos). Nea hace
 * ~4-10 llamadas por turno de cliente (contexto, "escribiendo…", 1-3
 * mensajes y, cuando aplica, ficha, handoff, agenda o adjuntos): alcanza para
 * 120-300 turnos por minuto, por encima del pico de un solo negocio. Un
 * cerebro desbocado en un bucle queda en 20/s, carga que el monolito absorbe
 * sin que la bandeja lo note.
 */
export const BOT_API_BUDGET = { windowMs: 60_000, max: 1200 };

/**
 * Autenticaciones FALLIDAS por IP: 30/min, y luego 429. Jamás tocan el
 * presupuesto de arriba, y una key correcta pasa aunque su IP esté frenada:
 * detrás del mismo proxy (o sin proxy, donde todo es "local") el cerebro puede
 * compartir IP con quien inunda. Adivinar la key tampoco es el riesgo: mide
 * 16+ caracteres.
 */
export const BOT_AUTH_FAILURES = { windowMs: 60_000, max: 30 };

/**
 * 036 — La llave llega en `X-API-Key` o, para `/api/bot/llm`, como
 * `Authorization: Bearer`: es lo que manda el SDK de OpenAI del cerebro, que
 * apunta su `base_url` al CRM y no sabe de cabeceras propias.
 */
function llaveDe(req: Request): string | null {
  const directa = req.headers.get("x-api-key");
  if (directa) return directa;
  const auth = req.headers.get("authorization");
  const m = auth ? /^Bearer\s+(.+)$/i.exec(auth.trim()) : null;
  return m?.[1] ?? null;
}

/**
 * 067 — La llave dice de QUÉ tenant es la llamada: cada uno tiene la suya
 * (`brain_connection`), y `BOT_API_KEY` del entorno vale para la organización
 * principal. Un tenant suspendido no autentica. El tenant resuelto queda
 * asociado al `Request` para `resolveInstanceOrg(req)`.
 */
const orgPorRequest = new WeakMap<Request, string>();

export async function requireBotKey(
  req: Request,
  resolver: (llave: string | null) => Promise<string | null> = orgDeLlave
): Promise<Response | null> {
  let organizationId: string | null = null;
  try {
    organizationId = await resolver(llaveDe(req));
  } catch (err) {
    console.error("[bot] no se pudo resolver la llave:", err);
    return apiError(503, "unavailable", "No se pudo validar la llave");
  }
  if (!organizationId) {
    const ip = clientIp(req.headers);
    const fails = checkRateLimit(`bot-api-fail:${ip}`, BOT_AUTH_FAILURES);
    return fails.allowed
      ? apiError(401, "unauthorized", "No autorizado")
      : apiError(429, "rate_limited", "Demasiados intentos fallidos");
  }
  orgPorRequest.set(req, organizationId);
  // «Quién responde»: la única huella que deja el cerebro externo en el CRM.
  // Se marca al autenticar, antes del presupuesto: un cerebro frenado por 429
  // sigue siendo el que contesta.
  markBotSeen(organizationId);
  // Un presupuesto por tenant: el cerebro desbocado de uno no frena a otro.
  const rl = checkRateLimit(`bot-api:${organizationId}`, BOT_API_BUDGET);
  if (!rl.allowed) return apiError(429, "rate_limited", "Demasiadas solicitudes");
  return null;
}

/**
 * El tenant de una llamada ya autenticada por `requireBotKey`. Sin `req` (o
 * sin autenticar) cae en la organización principal, como antes de 067.
 */
export async function resolveInstanceOrg(req?: Request): Promise<string | null> {
  const org = req ? orgPorRequest.get(req) : undefined;
  if (org) return org;
  return primaryOrgId();
}

/** Solo para tests. */
export function resetInstanceOrgCache(): void {
  resetPrimaryOrgCache();
}
