import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { WebhookPayload } from "@/server/inbox/webhook";
import {
  getCredentialsByPhoneNumberId,
  getCredentialsByWabaId,
} from "@/server/whatsapp/credentials";
import { getInstagramCredentialsByIgUserId } from "@/server/instagram/credentials";
import { getMessengerCredentialsByPageId } from "@/server/messenger/credentials";
import { normalizeMetaPagePayload } from "@/server/messenger/ingest";
import { zernioTargetChannel } from "@/server/zernio/dispatch";
import { findZernioConnection } from "@/server/zernio/conexiones";
import type { ZernioEvent } from "@/server/zernio";
import type { FuenteWebhook } from "./eventos";

/**
 * 047 — A qué organización va un evento, resuelto ANTES de guardarlo
 * (`webhook_event.organization_id` es NOT NULL, Principio III).
 *
 * Usa exactamente los buscadores que ya usa la ingesta de cada canal, así que
 * resuelve lo mismo que ella. `null` = nadie conectó ese número o esa cuenta:
 * la ingesta lo iba a descartar igual, y no se guarda.
 *
 * Los buscadores se inyectan para poder probarlo sin base.
 */
export type Buscadores = {
  porPhoneNumberId: (id: string) => Promise<{ organizationId: string } | null>;
  porWabaId: (id: string) => Promise<{ organizationId: string } | null>;
  porIgUserId: (id: string) => Promise<{ organizationId: string } | null>;
  porPageId: (id: string) => Promise<{ organizationId: string } | null>;
  porCuentaZernio: (evt: ZernioEvent) => Promise<{ organizationId: string } | null>;
};

/**
 * 067 — Un tenant suspendido no recibe: su evento se resuelve a «nadie», así
 * que no se guarda ni se ingiere, y Meta recibe su 200 igual (no reintenta).
 */
async function activa(organizationId: string): Promise<boolean> {
  const [org] = await getDb()
    .select({ status: schema.organization.status })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  return org?.status === "active";
}

const buscadoresReales: Buscadores = {
  porPhoneNumberId: getCredentialsByPhoneNumberId,
  porWabaId: getCredentialsByWabaId,
  porIgUserId: getInstagramCredentialsByIgUserId,
  porPageId: getMessengerCredentialsByPageId,
  porCuentaZernio: (async (evt: ZernioEvent) => {
    const canal = zernioTargetChannel(evt);
    if (!canal) return null;
    const found = await findZernioConnection(canal, evt.account);
    return found ? { organizationId: found.connection.organizationId } : null;
  }),
};

/** La primera organización que se resuelva: una entrega trae una sola cuenta. */
async function primera(
  ids: (string | null | undefined)[],
  buscar: (id: string) => Promise<{ organizationId: string } | null>
): Promise<string | null> {
  for (const id of new Set(ids.filter((x): x is string => Boolean(x)))) {
    const found = await buscar(id);
    if (found) return found.organizationId;
  }
  return null;
}

/**
 * 067 — A quién va el evento Y si ese negocio puede recibirlo. Un negocio
 * suspendido no recibe: la ruta responde 200 (Meta no reintenta) y el evento
 * se descarta sin guardarse ni ingerirse. Distinto de «nadie conectó ese
 * número», que sigue el camino de siempre.
 */
export async function resolverDestino(
  fuente: FuenteWebhook,
  payload: unknown,
  b: Buscadores = buscadoresReales,
  esActiva: (organizationId: string) => Promise<boolean> = activa
): Promise<{ organizationId: string | null; suspendida: boolean }> {
  const organizationId = await resolverOrganizacion(fuente, payload, b);
  if (!organizationId) return { organizationId: null, suspendida: false };
  if (await esActiva(organizationId)) return { organizationId, suspendida: false };
  return { organizationId: null, suspendida: true };
}

export async function resolverOrganizacion(
  fuente: FuenteWebhook,
  payload: unknown,
  b: Buscadores = buscadoresReales
): Promise<string | null> {
  switch (fuente) {
    case "whatsapp": {
      const entries = (payload as WebhookPayload).entry ?? [];
      const porNumero = await primera(
        entries.flatMap((e) => (e.changes ?? []).map((c) => c.value?.metadata?.phone_number_id)),
        b.porPhoneNumberId
      );
      // Los estados de plantillas llegan a nivel WABA, sin número.
      return porNumero ?? primera(entries.map((e) => e.id), b.porWabaId);
    }
    case "meta_instagram": {
      const entries = (payload as { entry?: { id?: string }[] }).entry ?? [];
      return primera(entries.map((e) => e.id), b.porIgUserId);
    }
    case "meta_messenger":
      return primera(
        normalizeMetaPagePayload(payload).map((e) => e.routeKey),
        b.porPageId
      );
    case "zernio": {
      const found = await b.porCuentaZernio(payload as ZernioEvent);
      return found?.organizationId ?? null;
    }
  }
}
