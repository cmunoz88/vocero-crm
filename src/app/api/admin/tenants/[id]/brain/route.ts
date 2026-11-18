import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { cerebroDto, guardarUrlsCerebro } from "@/server/brains/por-org";
import { withSuperadmin } from "@/server/tenants/api";
import { tenantPorId } from "@/server/tenants/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const url = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (v === "") return true;
    try {
      const u = new URL(v);
      return (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Debe ser una URL http(s) sin usuario ni contraseña")
  .nullable()
  .optional();

const schema = z.object({ dispatchUrl: url, healthUrl: url });

/** 067 — A dónde le despacha el CRM al cerebro de este tenant. */
export const PUT = withSuperadmin(async (_admin, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!(await tenantPorId(id))) return apiError(404, "not_found", "Ese negocio no existe.");
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  await guardarUrlsCerebro(id, {
    dispatchUrl: body.data.dispatchUrl || null,
    healthUrl: body.data.healthUrl || null,
  });
  return Response.json({ brain: await cerebroDto(id) });
});
