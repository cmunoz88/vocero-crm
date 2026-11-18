import { z } from "zod";
import { parseBody } from "@/lib/api";
import { crearInvitacion, listarInvitaciones } from "@/server/platform/invitaciones";
import { withSuperadmin } from "@/server/tenants/api";

export const dynamic = "force-dynamic";

/** 068 — Invitaciones de negocio (superadministrador). */
export const GET = withSuperadmin(async () =>
  Response.json({ invitaciones: await listarInvitaciones() }, { headers: { "cache-control": "no-store" } })
);

const crearSchema = z.object({
  note: z.string().trim().max(120).optional(),
  dias: z.number().int().min(1).max(30).optional(),
});

/** El enlace se muestra UNA vez: solo se guarda su hash. */
export const POST = withSuperadmin(async (admin, req: Request) => {
  const body = await parseBody(req, crearSchema);
  if (!body.ok) return body.response;
  const { invitacion, url } = await crearInvitacion({ ...body.data, createdBy: admin.userId });
  return Response.json(
    { id: invitacion.id, url, expiresAt: invitacion.expiresAt.toISOString() },
    { status: 201, headers: { "cache-control": "no-store" } }
  );
});
