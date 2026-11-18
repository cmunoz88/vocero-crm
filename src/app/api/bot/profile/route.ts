import { modeloEfectivo, modelosElegibles } from "@/server/platform/ia";
import { agenteDeConversacion, agentePorId, esAgentePrincipal } from "@/server/agents";
import { asc, eq } from "drizzle-orm";
import { scoped } from "@/lib/db/tenant";
import { getDb, schema } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { serializeBotProfile, type BotLlm } from "@/server/bot/profile";
import { resolveAiProvider } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

/**
 * Perfil del agente + knowledge base para un cerebro externo.
 * GET /api/bot/profile → {profile, kb, resources}. Sin caché: cada consulta
 * refleja lo que el dueño dejó en la UI al momento (el TTL vive del lado del
 * bot, que es quien sabe cada cuánto le conviene releer).
 */
export async function GET(req: Request) {
  const denied = await requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg(req);
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const db = getDb();
  // 068 — `?agentId=` (el del evento) o `?conversationId=`: el perfil de ese
  // agente, siempre del MISMO negocio. Sin ellos, el principal.
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");
  const conversationId = url.searchParams.get("conversationId");
  const profile = agentId
    ? await agentePorId(organizationId, agentId)
    : conversationId
      ? await agenteDeConversacion(organizationId, conversationId)
      : (
          await db
            .select()
            .from(schema.agentProfile)
            .where(scoped(schema.agentProfile.organizationId, organizationId, esAgentePrincipal()))
            .limit(1)
        )[0];
  if (!profile) {
    // Condición esperada (instancia sin perfil): el bot cae a su brief local.
    return apiError(404, "no_profile", "La instancia no tiene perfil de agente");
  }

  const kb = await db
    .select()
    .from(schema.kbEntry)
    .where(eq(schema.kbEntry.organizationId, organizationId))
    .orderBy(asc(schema.kbEntry.createdAt));

  // 036 — Con qué piensa el cerebro que no trae llave: el proxy del CRM.
  const ia = await resolveAiProvider(organizationId);
  // 068 — El modelo del agente (de los autorizados) gana al de la plataforma.
  const modelo = modeloEfectivo(profile.model, await modelosElegibles(), ia.ok ? ia.provider.model : null);
  const llm: BotLlm = ia.ok && modelo ? { path: "/api/bot/llm", model: modelo } : null;

  return Response.json(serializeBotProfile(profile, kb, llm));
}
