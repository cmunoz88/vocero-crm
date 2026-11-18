import { apiError } from "@/lib/api";
import { enlaceRestablecer } from "@/server/platform/users";
import { withSuperadmin } from "@/server/tenants/api";

export const dynamic = "force-dynamic";

/** 068 — Enlace de restablecimiento para entregar a mano (sin correo). 1 hora, un solo uso. */
export const POST = withSuperadmin(
  async (_admin, _req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const url = await enlaceRestablecer(id);
    if (!url) return apiError(404, "no_encontrado", "Esa cuenta no existe.");
    return Response.json({ url }, { headers: { "cache-control": "no-store" } });
  }
);
