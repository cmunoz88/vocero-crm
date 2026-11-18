import { apiError } from "@/lib/api";
import { cerebroDto, generarLlaveBot, quitarLlaveBot } from "@/server/brains/por-org";
import { withSuperadmin } from "@/server/tenants/api";
import { tenantPorId } from "@/server/tenants/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 067 — Genera (o rota) la llave del bot de este tenant. La respuesta trae la
 * llave en claro UNA vez; después solo se ven sus últimos 4.
 */
export const POST = withSuperadmin(async (_admin, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!(await tenantPorId(id))) return apiError(404, "not_found", "Ese negocio no existe.");
  const key = await generarLlaveBot(id);
  return Response.json(
    { key, brain: await cerebroDto(id) },
    { headers: { "cache-control": "no-store" } }
  );
});

/** 067 — Revoca la llave: el cerebro de este tenant deja de autenticar. */
export const DELETE = withSuperadmin(async (_admin, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!(await tenantPorId(id))) return apiError(404, "not_found", "Ese negocio no existe.");
  await quitarLlaveBot(id);
  return Response.json({ brain: await cerebroDto(id) });
});
