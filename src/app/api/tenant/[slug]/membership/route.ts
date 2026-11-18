import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { resolveMembership } from "@/server/auth/on-signup";

export const dynamic = "force-dynamic";

/**
 * 067 — ¿La sesión actual pertenece al negocio de este web ID? Lo pregunta
 * `/t/{slug}/login` justo después de entrar. Solo responde sobre la propia
 * sesión: sin sesión, o de otro negocio, `member: false` (no revela si el
 * web ID existe).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await getAuth()
    .api.getSession({ headers: await headers() })
    .catch(() => null);
  const m = session ? await resolveMembership(session.user.id) : null;
  const member = Boolean(m && m.orgSlug === slug.toLowerCase());
  return Response.json(
    { member, suspended: member && m?.orgStatus === "suspended" },
    { headers: { "cache-control": "no-store" } }
  );
}
