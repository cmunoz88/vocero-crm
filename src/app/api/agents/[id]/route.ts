import { modelosElegibles } from "@/server/platform/ia";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { agentePorId, borrarAgente } from "@/server/agents";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 068 — Edita un agente que NO es el principal (el principal se edita en la
 * pantalla del Agente, que además vigila el interruptor del cerebro).
 */
const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  instructions: z.string().max(8000).nullable().optional(),
  tone: z.string().max(500).nullable().optional(),
  greeting: z.string().max(1000).nullable().optional(),
  enabled: z.boolean().optional(),
  /** 068 · etapa 4 — Uno de los modelos autorizados; null = el de la plataforma. */
  model: z.string().trim().min(1).max(120).nullable().optional(),
});

export const PATCH = withAuth(async (session, req: Request, ctx: Ctx) => {
  if (session.role !== "owner") return apiError(403, "forbidden", "Solo el dueño edita agentes");
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const a = await agentePorId(session.organizationId, id);
  if (!a) return apiError(404, "not_found", "Agente no encontrado");
  // Del principal aquí solo se elige el modelo; lo demás, en la pantalla del Agente.
  if (a.isDefault && Object.keys(body.data).some((k) => k !== "model")) {
    return apiError(409, "principal", "El agente principal se edita en la pantalla del Agente");
  }
  if (body.data.model && !(await modelosElegibles()).includes(body.data.model)) {
    return apiError(422, "modelo_no_autorizado", "Ese modelo no está autorizado en la plataforma");
  }
  await getDb()
    .update(schema.agentProfile)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(schema.agentProfile.id, a.id));
  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Ctx) => {
  if (session.role !== "owner") return apiError(403, "forbidden", "Solo el dueño borra agentes");
  const { id } = await ctx.params;
  const r = await borrarAgente(session.organizationId, id);
  if (r === "no_encontrado") return apiError(404, "not_found", "Agente no encontrado");
  if (r === "principal") return apiError(409, "principal", "El agente principal no se borra");
  return Response.json({ ok: true });
});
