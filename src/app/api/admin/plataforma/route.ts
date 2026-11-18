import { z } from "zod";
import { parseBody } from "@/lib/api";
import { isAiConfiguredByEnv } from "@/lib/env";
import { last4 } from "@/lib/ai/presets";
import { estadoCorreo } from "@/server/email";
import { configDespachoDeOrg } from "@/server/brains/por-org";
import {
  guardarModelosAutorizados,
  iaBloqueada,
  MODELO_RE,
  modeloDePlataforma,
  modelosAutorizados,
} from "@/server/platform/ia";
import { estadisticasPorNegocio } from "@/server/platform/estadisticas";
import { primaryOrgId } from "@/server/tenants/primary";
import { listarTenants } from "@/server/tenants/service";
import { withSuperadmin } from "@/server/tenants/api";

export const dynamic = "force-dynamic";

/**
 * 068 · etapa 4 — El panel global: totales, estado de las integraciones y
 * los modelos autorizados. Ningún secreto sale: de la llave, sus últimos 4.
 */
export const GET = withSuperadmin(async () => {
  const [tenants, stats, modelos, principal] = await Promise.all([
    listarTenants(),
    estadisticasPorNegocio(),
    modelosAutorizados(),
    primaryOrgId(),
  ]);
  const totales = { negocios: tenants.length, activos: 0, conIa: 0, numeros: 0, conversaciones: 0, mensajes30d: 0 };
  for (const t of tenants) {
    if (t.status === "active") totales.activos++;
    const s = stats.get(t.id);
    if (!s) continue;
    if (s.ia) totales.conIa++;
    totales.numeros += s.numeros;
    totales.conversaciones += s.conversaciones;
    totales.mensajes30d += s.mensajes30d;
  }
  const token = process.env.OPENROUTER_API_TOKEN?.trim() ?? "";
  const cerebro = principal ? await configDespachoDeOrg(principal) : null;
  const correo = estadoCorreo();
  return Response.json(
    {
      totales,
      integraciones: {
        correo: { habilitado: correo.habilitado, remitente: correo.remitente },
        ia: {
          bloqueada: iaBloqueada(),
          configurada: isAiConfiguredByEnv(),
          last4: token ? last4(token) : null,
          modelo: modeloDePlataforma(),
        },
        cerebro: cerebro ? { activo: cerebro.active, host: cerebro.active ? cerebro.host : null } : null,
      },
      modelos,
    },
    { headers: { "cache-control": "no-store" } }
  );
});

const putSchema = z.object({
  modelos: z.array(z.string().trim().regex(MODELO_RE, "Modelo inválido")).max(50),
});

/** El superadministrador fija los modelos que pueden elegir los agentes. */
export const PUT = withSuperadmin(async (admin, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  const modelos = await guardarModelosAutorizados(body.data.modelos, admin.userId);
  return Response.json({ ok: true, modelos });
});
