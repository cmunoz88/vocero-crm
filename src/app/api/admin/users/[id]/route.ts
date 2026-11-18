import { apiError } from "@/lib/api";
import { borrarUsuario } from "@/server/platform/users";
import { withSuperadmin } from "@/server/tenants/api";

export const dynamic = "force-dynamic";

const MENSAJES = {
  no_encontrado: "Esa cuenta no existe.",
  uno_mismo: "No puedes borrar tu propia cuenta.",
  superadmin: "La cuenta del superadministrador no se borra.",
  unico_dueno: "Es la única dueña de un negocio: borra o suspende el negocio primero.",
} as const;

export const DELETE = withSuperadmin(
  async (admin, _req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const r = await borrarUsuario(id, admin.userId);
    if (!r.ok) {
      const status = r.motivo === "no_encontrado" ? 404 : 409;
      const extra = r.negocios?.length ? ` (${r.negocios.join(", ")})` : "";
      return apiError(status, r.motivo, MENSAJES[r.motivo] + extra);
    }
    return Response.json({ ok: true });
  }
);
