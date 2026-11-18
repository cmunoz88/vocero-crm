import { apiError } from "@/lib/api";
import { enlaceVerificacionManual } from "@/server/platform/invitaciones";
import { withSuperadmin } from "@/server/tenants/api";

export const dynamic = "force-dynamic";

/** 068 — Sin correo: un enlace de verificación para entregar a mano (rota el de invitación). */
export const POST = withSuperadmin(
  async (_admin, _req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const url = await enlaceVerificacionManual(id);
    if (!url) return apiError(409, "no_aplica", "Solo para invitaciones vigentes que esperan verificar su correo.");
    return Response.json({ url }, { headers: { "cache-control": "no-store" } });
  }
);
