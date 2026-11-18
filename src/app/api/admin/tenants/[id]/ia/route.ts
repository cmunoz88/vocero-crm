import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { problemaDelCerebro } from "@/server/brains/problema";
import { MENSAJES_SLUG, withSuperadmin } from "@/server/tenants/api";
import { tenantPorId } from "@/server/tenants/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({ enabled: z.boolean() });

/**
 * 068 · etapa 4 — El superadministrador apaga (o enciende) la IA de TODO un
 * negocio: el interruptor del agente principal. El dueño puede volver a
 * encenderla desde su pantalla Agente (decisión del dueño de la plataforma).
 * Encender exige un cerebro sano, igual que en la pantalla del dueño.
 */
export const PATCH = withSuperadmin(async (_admin, req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  if (!(await tenantPorId(id))) return apiError(404, "not_found", MENSAJES_SLUG.no_encontrado!);
  if (body.data.enabled) {
    const problema = await problemaDelCerebro(id);
    if (problema) return apiError(409, "sin_cerebro", problema);
  }
  const filas = await getDb()
    .update(schema.agentProfile)
    .set({ enabled: body.data.enabled, updatedAt: new Date() })
    .where(and(eq(schema.agentProfile.organizationId, id), eq(schema.agentProfile.isDefault, true)))
    .returning({ id: schema.agentProfile.id });
  if (filas.length === 0) return apiError(404, "sin_agente", "El negocio no tiene agente principal");
  return Response.json({ ok: true, enabled: body.data.enabled });
});
