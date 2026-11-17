import { apiError, parseBody } from "@/lib/api";
import { resolveInstanceOrg } from "@/server/bot/auth";
import {
  prospectoSchema,
  registrarProspecto,
  requireProspectosKey,
} from "@/server/servicio/prospectos";

export const dynamic = "force-dynamic";

/**
 * Alta o actualización de un prospecto desde un sistema externo (Sol).
 * Idempotente: el mismo negocio (teléfono o correo) no se duplica; un segundo
 * envío completa la ficha y, si trae `etapa`, mueve el lead.
 * Auth: `X-API-Key` o `Authorization: Bearer` contra `PROSPECTOS_API_KEY`.
 */
export async function POST(req: Request) {
  const denegado = requireProspectosKey(req);
  if (denegado) return denegado;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const body = await parseBody(req, prospectoSchema);
  if (!body.ok) return body.response;

  try {
    const r = await registrarProspecto(organizationId, body.data);
    return Response.json(r, { status: r.nuevo ? 201 : 200 });
  } catch (err) {
    console.error("[servicio/prospectos] error:", err);
    return apiError(500, "internal", "Error interno");
  }
}
