import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 069 — `signed_request` de Meta (callbacks de desautorización y de
 * eliminación de datos): `<firma>.<carga>`, ambas en base64url. La firma es
 * HMAC-SHA256 de la carga (tal cual llega, en base64url) con el App Secret.
 * Una firma que no cuadra, un algoritmo distinto o una carga sin `user_id`
 * devuelven `null`: quien llama responde 400 sin tocar nada.
 */
export type SignedRequest = { userId: string; issuedAt: number | null };

function deB64Url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function aB64Url(b: Buffer): string {
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function leerSignedRequest(raw: unknown, appSecret: string | undefined): SignedRequest | null {
  if (typeof raw !== "string" || !appSecret || raw.length > 8192) return null;
  const partes = raw.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
  const [firmaB64, cargaB64] = partes as [string, string];
  const esperada = createHmac("sha256", appSecret).update(cargaB64).digest();
  const recibida = deB64Url(firmaB64);
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const carga = JSON.parse(deB64Url(cargaB64).toString("utf8")) as {
      algorithm?: unknown;
      user_id?: unknown;
      issued_at?: unknown;
    };
    if (String(carga.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
    if (typeof carga.user_id !== "string" || !/^\d{1,32}$/.test(carga.user_id)) return null;
    return {
      userId: carga.user_id,
      issuedAt: typeof carga.issued_at === "number" ? carga.issued_at : null,
    };
  } catch {
    return null;
  }
}

/** Para las pruebas y el wa-mock: arma un `signed_request` válido. */
export function firmarSignedRequest(carga: Record<string, unknown>, appSecret: string): string {
  const cargaB64 = aB64Url(Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", ...carga })));
  const firma = aB64Url(createHmac("sha256", appSecret).update(cargaB64).digest());
  return `${firma}.${cargaB64}`;
}
