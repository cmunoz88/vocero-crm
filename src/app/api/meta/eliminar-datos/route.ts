import { getEnv } from "@/lib/env";
import { leerCallbackDeMeta } from "../_comun";
import { eliminarDatosDeUsuarioMeta } from "@/server/meta/cumplimiento";

/**
 * 069 — «URL de solicitud de eliminación de datos» de la app de Meta.
 * Responde lo que Meta pide: `{ url, confirmation_code }`; la `url` abre la
 * página pública donde el usuario ve el estado. Pública (firma de Meta).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sr = await leerCallbackDeMeta(req);
  if (!sr) return Response.json({ error: "invalid_signed_request" }, { status: 400 });
  try {
    const r = await eliminarDatosDeUsuarioMeta(sr.userId);
    const base = getEnv().APP_BASE_URL.replace(/\/$/, "");
    return Response.json({
      url: `${base}/eliminar-datos?codigo=${r.confirmationCode}`,
      confirmation_code: r.confirmationCode,
    });
  } catch {
    console.error("[meta] fallo al procesar la eliminación de datos");
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
