import { getEnv } from "@/lib/env";
import { leerSignedRequest, type SignedRequest } from "@/lib/meta/signed-request";

/**
 * 069 — Los callbacks de Meta llegan como `application/x-www-form-urlencoded`
 * con un solo campo, `signed_request`. Sin firma válida: 400 y nada cambia.
 */
export async function leerCallbackDeMeta(req: Request): Promise<SignedRequest | null> {
  try {
    const form = new URLSearchParams(await req.text());
    return leerSignedRequest(form.get("signed_request"), getEnv().META_APP_SECRET?.trim());
  } catch {
    return null;
  }
}
