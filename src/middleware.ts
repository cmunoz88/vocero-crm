import { NextResponse, type NextRequest } from "next/server";

/**
 * 067 — Las páginas de un tenant (`/t/{slug}/…`) le dicen al servidor de qué
 * negocio son: el layout raíz pinta su marca (acento, logo, favicon) antes de
 * que haya sesión. Solo pasa un encabezado; no autentica ni redirige.
 */
export function middleware(req: NextRequest) {
  const m = /^\/t\/([a-z0-9-]{1,60})(?:\/|$)/.exec(req.nextUrl.pathname);
  const headers = new Headers(req.headers);
  headers.delete("x-vocero-tenant");
  if (m?.[1]) headers.set("x-vocero-tenant", m[1]);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/t/:path*"] };
