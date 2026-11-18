import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { cerebroDto } from "@/server/brains/por-org";
import { MENSAJES_SLUG, withSuperadmin } from "@/server/tenants/api";
import {
  borrarTenant,
  cambiarEstadoTenant,
  listarTenants,
  miembrosDe,
  renombrarTenant,
} from "@/server/tenants/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** 067 — Detalle de un tenant: resumen, miembros y cerebro. */
export const GET = withSuperadmin(async (_admin, _req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const tenant = (await listarTenants()).find((t) => t.id === id);
  if (!tenant) return apiError(404, "not_found", MENSAJES_SLUG.no_encontrado!);
  const [members, brain] = await Promise.all([miembrosDe(id), cerebroDto(id)]);
  return Response.json(
    {
      tenant,
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        name: m.name,
        email: m.email,
        createdAt: m.createdAt.toISOString(),
      })),
      brain,
    },
    { headers: { "cache-control": "no-store" } }
  );
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(1).max(60).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

/** 067 — Renombrar, cambiar el web ID, suspender o reactivar. */
export const PATCH = withSuperadmin(async (_admin, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  if (body.data.name !== undefined || body.data.slug !== undefined) {
    const r = await renombrarTenant(id, body.data);
    if (!r.ok) {
      const status = r.motivo === "no_encontrado" ? 404 : r.motivo === "slug_ocupado" ? 409 : 422;
      return apiError(status, r.motivo, MENSAJES_SLUG[r.motivo]!);
    }
  }
  if (body.data.status && !(await cambiarEstadoTenant(id, body.data.status))) {
    return apiError(404, "not_found", MENSAJES_SLUG.no_encontrado!);
  }
  return Response.json({ ok: true });
});

const deleteSchema = z.object({ confirm: z.string() });

/** 067 — Borrado DEFINITIVO (suspendido + escribir el web ID). */
export const DELETE = withSuperadmin(async (admin, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, deleteSchema);
  if (!body.ok) return body.response;
  const r = await borrarTenant(id, body.data.confirm, admin);
  if (r.ok) return Response.json(r);
  switch (r.motivo) {
    case "no_encontrado":
      return apiError(404, "not_found", MENSAJES_SLUG.no_encontrado!);
    case "confirmacion":
      return apiError(422, "confirmacion", "Escribe el web ID exacto del negocio para confirmar.");
    case "activo":
      return apiError(409, "activo", "Suspende el negocio antes de borrarlo.");
    case "propio":
      return apiError(409, "propio", "No puedes borrar el negocio al que perteneces.");
  }
});
