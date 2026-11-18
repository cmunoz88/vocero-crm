import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { actualizarNumero, quitarNumero } from "@/server/whatsapp/credentials";
import { agentePorId } from "@/server/agents";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  label: z.string().trim().max(60).nullable().optional(),
  /** El agente que contesta este número (modo por número); null = el principal. */
  agentProfileId: z.string().trim().min(1).nullable().optional(),
  isPrimary: z.literal(true).optional(),
});

export const PATCH = withAuth(async (session, req: Request, ctx: Ctx) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el dueño del negocio cambia sus números");
  }
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  // Un agente de OTRO negocio jamás se asigna: se responde igual que uno inexistente.
  if (body.data.agentProfileId && !(await agentePorId(session.organizationId, body.data.agentProfileId))) {
    return apiError(404, "agente_no_encontrado", "Ese agente no existe");
  }
  const ok = await actualizarNumero(session.organizationId, id, {
    label: body.data.label === undefined ? undefined : body.data.label || null,
    agentProfileId: body.data.agentProfileId,
    isPrimary: body.data.isPrimary,
  });
  if (!ok) return apiError(404, "not_found", "Número no encontrado");
  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Ctx) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el dueño del negocio quita números");
  }
  const { id } = await ctx.params;
  if (!(await quitarNumero(session.organizationId, id))) {
    return apiError(404, "not_found", "Número no encontrado");
  }
  return Response.json({ ok: true });
});
