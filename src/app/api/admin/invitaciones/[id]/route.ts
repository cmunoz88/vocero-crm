import { apiError } from "@/lib/api";
import { revocarInvitacion } from "@/server/platform/invitaciones";
import { withSuperadmin } from "@/server/tenants/api";

export const dynamic = "force-dynamic";

/** 068 — Revocar una invitación (si no se usó). */
export const DELETE = withSuperadmin(
  async (_admin, _req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!(await revocarInvitacion(id))) return apiError(409, "no_revocable", "Esa invitación ya se usó o no existe.");
    return Response.json({ ok: true });
  }
);
