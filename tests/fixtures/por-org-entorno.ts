import { leerConfigDespacho, urlSaludCerebro } from "@/server/brains/config";

/**
 * 067 — Doble de `@/server/brains/por-org` para pruebas sin base: todo
 * tenant se comporta como la organización principal sin configuración propia,
 * o sea, lee el cerebro del entorno como antes de multi-tenant. Uso:
 *
 *   vi.mock("@/server/brains/por-org", () => import("../fixtures/por-org-entorno"));
 */
export const ORG_ENTORNO = "org_principal";

export async function entornoCerebro(): Promise<Record<string, string | undefined>> {
  return process.env;
}
export async function configDespachoDeOrg() {
  return leerConfigDespacho(process.env);
}
export async function despachoActivoDeOrg() {
  return leerConfigDespacho(process.env).active;
}
export async function urlSaludCerebroDeOrg() {
  return urlSaludCerebro(process.env);
}
export async function llaveBotConfiguradaDeOrg() {
  const k = process.env.BOT_API_KEY;
  return typeof k === "string" && k.length >= 16;
}
export async function orgDeLlave(llave: string | null): Promise<string | null> {
  const env = process.env.BOT_API_KEY;
  return env && env.length >= 16 && llave === env ? ORG_ENTORNO : null;
}
export function hashLlave(llave: string): string {
  return llave;
}
