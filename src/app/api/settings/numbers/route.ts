import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { agregarNumero, listarNumeros, tokenLast4 } from "@/server/whatsapp/credentials";
import { registerWebhookForNumber, testConnection } from "@/server/whatsapp/connect";
import { webhookUrl, webhookVerifyToken } from "@/server/whatsapp/webhook-url";
import { modoDeAgentes } from "@/server/agents";

export const dynamic = "force-dynamic";

/**
 * 068 — Los números de WhatsApp del negocio. El token jamás sale: solo sus
 * últimos 4. Cada negocio ve únicamente los suyos.
 */
export const GET = withAuth(async (session) => {
  const numeros = await listarNumeros(session.organizationId);
  return Response.json({
    modo: await modoDeAgentes(session.organizationId),
    numeros: numeros.map((n) => ({
      id: n.id,
      label: n.label,
      phoneNumberId: n.phoneNumberId,
      wabaId: n.wabaId,
      displayPhoneNumber: n.displayPhoneNumber,
      verifiedName: n.verifiedName,
      status: n.status,
      isPrimary: n.isPrimary,
      agentProfileId: n.agentProfileId,
      tokenLast4: tokenLast4(n.token),
    })),
  });
});

const postSchema = z.object({
  label: z.string().trim().max(60).optional(),
  wabaId: z.string().trim().min(1),
  phoneNumberId: z.string().trim().min(1),
  token: z.string().trim().min(1),
});

/** Agrega OTRO número (el principal se conecta en Ajustes → WhatsApp). */
export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el dueño del negocio conecta números");
  }
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;

  const check = await testConnection(body.data.phoneNumberId, body.data.token);
  if (!check.ok) {
    return apiError(check.code === "meta_unavailable" ? 503 : 422, check.code, check.message);
  }

  const r = await agregarNumero({
    organizationId: session.organizationId,
    wabaId: body.data.wabaId,
    phoneNumberId: body.data.phoneNumberId,
    token: body.data.token,
    label: body.data.label || null,
    displayPhoneNumber: check.displayPhoneNumber,
    verifiedName: check.verifiedName,
  });
  if (!r.ok) {
    // Mismo mensaje sin importar de quién es: no se revela otro negocio.
    return apiError(409, "numero_ocupado", "Ese número ya está conectado en esta plataforma");
  }

  const webhook = await registerWebhookForNumber({
    wabaId: body.data.wabaId,
    phoneNumberId: body.data.phoneNumberId,
    token: body.data.token,
    webhookUrl: webhookUrl("wa"),
    verifyToken: webhookVerifyToken(),
    messagingAccountId: null,
  });

  return Response.json({ ok: true, id: r.id, displayPhoneNumber: check.displayPhoneNumber, webhook }, { status: 201 });
});
