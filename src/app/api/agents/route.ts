import { modelosElegibles } from "@/server/platform/ia";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { cambiarModoAgentes, crearAgente, listarAgentes, modoDeAgentes } from "@/server/agents";

export const dynamic = "force-dynamic";

/** 068 — Los agentes del negocio y cómo se reparten los números. */
export const GET = withAuth(async (session) => {
  const agentes = await listarAgentes(session.organizationId);
  return Response.json({
    // 068 · etapa 4 — Lo que cada agente puede elegir (el de la plataforma + los autorizados).
    modelos: await modelosElegibles(),
    modo: await modoDeAgentes(session.organizationId),
    agentes: agentes.map((a) => ({
      id: a.id,
      name: a.name,
      enabled: a.enabled,
      isDefault: a.isDefault,
      role: a.role,
      model: a.model,
      instructions: a.instructions,
    })),
  });
});

const postSchema = z.object({ name: z.string().trim().min(1).max(60) });

export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") return apiError(403, "forbidden", "Solo el dueño crea agentes");
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;
  const a = await crearAgente(session.organizationId, body.data.name);
  return Response.json({ ok: true, id: a.id }, { status: 201 });
});

const patchSchema = z.object({ modo: z.enum(["compartido", "por_numero"]) });

/** Cambia el modo: un agente para todos los números, o uno por número. */
export const PATCH = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") return apiError(403, "forbidden", "Solo el dueño cambia el modo");
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  await cambiarModoAgentes(session.organizationId, body.data.modo);
  return Response.json({ ok: true });
});
