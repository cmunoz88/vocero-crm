import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { MENSAJES_SLUG, withSuperadmin } from "@/server/tenants/api";
import { crearTenant, listarTenants } from "@/server/tenants/service";

export const dynamic = "force-dynamic";

/** 067 — Lista de tenants (superusuario). */
export const GET = withSuperadmin(async () => {
  return Response.json({ tenants: await listarTenants() }, { headers: { "cache-control": "no-store" } });
});

const altaSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(60),
  owner: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
    username: z.string().trim().regex(/^[a-zA-Z0-9_.]{3,30}$/).optional(),
    password: z.string().min(8).max(128),
  }),
});

/** 067 — Alta de tenant con la cuenta de su dueño. */
export const POST = withSuperadmin(async (_admin, req: Request) => {
  const body = await parseBody(req, altaSchema);
  if (!body.ok) return body.response;
  const r = await crearTenant(body.data);
  if (r.ok) return Response.json(r, { status: 201 });
  const status = r.motivo === "slug_ocupado" || r.motivo === "correo_ocupado" || r.motivo === "usuario_ocupado" ? 409 : 422;
  return apiError(status, r.motivo, MENSAJES_SLUG[r.motivo] ?? r.detalle ?? "No se pudo crear la cuenta del dueño");
});
