import { configDespachoDeOrg, urlSaludCerebroDeOrg } from "@/server/brains/por-org";
import { getBrainHealth } from "@/server/bot/status";

/**
 * Por qué no se puede encender la IA de un negocio, o `null` si tiene un
 * cerebro sano. Lo usan el interruptor del dueño (pantalla Agente) y el del
 * superadministrador (/admin): las dos puertas, la misma regla.
 */
export async function problemaDelCerebro(organizationId: string): Promise<string | null> {
  const despacho = await configDespachoDeOrg(organizationId);
  if (!despacho.active) {
    return despacho.problem === "sin_llave"
      ? "Falta BOT_API_KEY: sin ella el CRM no puede despacharle a tu agente."
      : despacho.problem === "url"
        ? "BRAIN_DISPATCH_URL no es una dirección válida."
        : "No hay un agente conectado. Conéctalo (BRAIN_DISPATCH_URL) y vuelve a encenderlo.";
  }
  const salud = await getBrainHealth((await urlSaludCerebroDeOrg(organizationId)) ?? undefined);
  if (salud && !salud.reachable) {
    return `Tu agente (${despacho.host}) no contesta. Revisa que esté corriendo y vuelve a intentar.`;
  }
  return null;
}
