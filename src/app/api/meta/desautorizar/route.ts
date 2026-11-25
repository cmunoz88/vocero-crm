import { leerCallbackDeMeta } from "../_comun";
import { desautorizarUsuarioMeta } from "@/server/meta/cumplimiento";

/**
 * 069 — «URL de devolución de llamada de desautorización» de la app de Meta.
 * Quien quitó la app: sus conexiones piden reconectar. Pública (la protege la
 * firma del `signed_request`).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sr = await leerCallbackDeMeta(req);
  if (!sr) return Response.json({ error: "invalid_signed_request" }, { status: 400 });
  try {
    await desautorizarUsuarioMeta(sr.userId);
  } catch {
    console.error("[meta] fallo al procesar la desautorización");
    return Response.json({ error: "server_error" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
