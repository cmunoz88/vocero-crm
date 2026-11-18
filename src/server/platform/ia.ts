import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * 068 · etapa 4 — La IA de la plataforma.
 *
 * - **Llave fija** (`PLATFORM_AI_LOCK=true`): todos los negocios piensan con
 *   la llave `OPENROUTER_API_TOKEN` del entorno. Lo guardado en Ajustes → IA se
 *   ignora y los dueños no pueden cambiarlo. Apagada (por defecto), todo sigue
 *   como antes: cada negocio puede poner la suya.
 * - **Modelos autorizados**: el superadministrador decide la lista; cada
 *   agente elige uno de ella. Sin lista, solo vale el modelo de la plataforma
 *   (`OPENROUTER_MODEL`). El proxy del cerebro (`/api/bot/llm`) cambia un
 *   modelo no autorizado por el de la plataforma: así una lista corta es
 *   también un techo de costo.
 */

/** Se lee de `process.env` directo, como las banderas: no depende de que todo el entorno valide. */
export function iaBloqueada(): boolean {
  const v = process.env.PLATFORM_AI_LOCK?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on";
}

/** El modelo por defecto de la plataforma (`OPENROUTER_MODEL`), o null. */
export function modeloDePlataforma(): string | null {
  const v = process.env.OPENROUTER_MODEL?.trim();
  return v ? v : null;
}

const CLAVE_MODELOS = "allowed_models";

export const MODELO_RE = /^[a-zA-Z0-9._:/-]{2,120}$/;

export async function modelosAutorizados(): Promise<string[]> {
  const [fila] = await getDb()
    .select({ value: schema.platformSetting.value })
    .from(schema.platformSetting)
    .where(eq(schema.platformSetting.key, CLAVE_MODELOS))
    .limit(1);
  const v = fila?.value;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function guardarModelosAutorizados(modelos: string[], actorUserId: string | null): Promise<string[]> {
  const limpia = [...new Set(modelos.map((m) => m.trim()).filter((m) => MODELO_RE.test(m)))].slice(0, 50);
  await getDb()
    .insert(schema.platformSetting)
    .values({ key: CLAVE_MODELOS, value: limpia, updatedBy: actorUserId })
    .onConflictDoUpdate({
      target: schema.platformSetting.key,
      set: { value: limpia, updatedBy: actorUserId, updatedAt: new Date() },
    });
  return limpia;
}

/** Lo que un agente puede elegir: los autorizados y, siempre, el de la plataforma. */
export async function modelosElegibles(): Promise<string[]> {
  const base = modeloDePlataforma();
  const lista = await modelosAutorizados();
  return base && !lista.includes(base) ? [base, ...lista] : lista;
}

/** Pura: el modelo con que piensa un agente. Uno fuera de la lista cae al por defecto. */
export function modeloEfectivo(
  elegido: string | null | undefined,
  elegibles: string[],
  porDefecto: string | null
): string | null {
  if (elegido && elegibles.includes(elegido)) return elegido;
  return porDefecto;
}

/**
 * Pura: el cuerpo que el proxy reenvía. Si pide un modelo no autorizado (y
 * hay lista), se cambia por el de defecto. Un cuerpo que no es JSON pasa tal
 * cual: el proveedor lo rechazará con su propio error.
 */
export function cuerpoConModeloAutorizado(
  cuerpoCrudo: string,
  elegibles: string[],
  porDefecto: string | null
): string {
  if (elegibles.length === 0 || !porDefecto) return cuerpoCrudo;
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(cuerpoCrudo);
  } catch {
    return cuerpoCrudo;
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return cuerpoCrudo;
  const modelo = (cuerpo as { model?: unknown }).model;
  if (typeof modelo === "string" && elegibles.includes(modelo)) return cuerpoCrudo;
  return JSON.stringify({ ...(cuerpo as object), model: porDefecto });
}
