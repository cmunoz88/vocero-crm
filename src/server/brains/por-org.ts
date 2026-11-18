import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";
import { leerConfigDespacho, urlSaludCerebro, type ConfigDespacho } from "@/server/brains/config";
import { primaryOrgId } from "@/server/tenants/primary";

/**
 * 067 — El cerebro de cada tenant.
 *
 * Cada organización puede guardar su URL de despacho, su URL de salud y su
 * llave del bot (`brain_connection`). Se traduce al mismo «entorno» que antes
 * leía `leerConfigDespacho`, así que las reglas de validación son idénticas.
 * La organización principal sin fila propia sigue usando las variables de
 * entorno: una instancia que ya tenía su cerebro no nota el cambio.
 */

type Entorno = Record<string, string | undefined>;

const MIN_KEY_LENGTH = 16;

export function hashLlave(llave: string): string {
  return createHash("sha256").update(llave, "utf8").digest("hex");
}

type Fila = typeof schema.brainConnection.$inferSelect;

async function filaDe(organizationId: string): Promise<Fila | null> {
  const [row] = await getDb()
    .select()
    .from(schema.brainConnection)
    .where(scoped(schema.brainConnection.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

function tieneConfigPropia(row: Fila | null): row is Fila {
  return Boolean(row && (row.dispatchUrl || row.keyHash || row.healthUrl));
}

function llaveDeFila(row: Fila): string | undefined {
  if (!row.keyCipher || !row.keyIv || !row.keyTag) return undefined;
  try {
    return decryptSecret({ cipher: row.keyCipher, iv: row.keyIv, tag: row.keyTag });
  } catch {
    // Llave ilegible (ENCRYPTION_KEY rotada): sin llave el despacho queda
    // inactivo y la tarjeta lo dice, en vez de tumbar el turno.
    return undefined;
  }
}

/** El entorno del cerebro de una organización. */
export async function entornoCerebro(organizationId: string): Promise<Entorno> {
  const row = await filaDe(organizationId);
  if (tieneConfigPropia(row)) {
    return {
      BRAIN_DISPATCH_URL: row.dispatchUrl ?? undefined,
      BRAIN_HEALTH_URL: row.healthUrl ?? undefined,
      BOT_API_KEY: llaveDeFila(row),
    };
  }
  if (organizationId === (await primaryOrgId())) return process.env;
  return {};
}

export async function configDespachoDeOrg(organizationId: string): Promise<ConfigDespacho> {
  return leerConfigDespacho(await entornoCerebro(organizationId));
}

export async function despachoActivoDeOrg(organizationId: string): Promise<boolean> {
  return (await configDespachoDeOrg(organizationId)).active;
}

export async function urlSaludCerebroDeOrg(organizationId: string): Promise<string | null> {
  return urlSaludCerebro(await entornoCerebro(organizationId));
}

export async function llaveBotConfiguradaDeOrg(organizationId: string): Promise<boolean> {
  const key = (await entornoCerebro(organizationId)).BOT_API_KEY;
  return typeof key === "string" && key.length >= MIN_KEY_LENGTH;
}

function igualesEnTiempoConstante(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * ¿De qué tenant es esta llave? Solo tenants ACTIVOS. Primero las llaves
 * guardadas (por su hash); luego `BOT_API_KEY` del entorno, que vale para la
 * organización principal mientras no tenga una configuración propia.
 */
export async function orgDeLlave(llave: string | null): Promise<string | null> {
  if (!llave || llave.length < MIN_KEY_LENGTH) return null;
  const db = getDb();
  const [row] = await db
    .select({ organizationId: schema.brainConnection.organizationId })
    .from(schema.brainConnection)
    .innerJoin(schema.organization, eq(schema.brainConnection.organizationId, schema.organization.id))
    .where(
      and(
        eq(schema.brainConnection.keyHash, hashLlave(llave)),
        eq(schema.organization.status, "active")
      )
    )
    .limit(1);
  if (row) return row.organizationId;

  const envKey = process.env.BOT_API_KEY;
  if (!envKey || envKey.length < MIN_KEY_LENGTH || !igualesEnTiempoConstante(llave, envKey)) {
    return null;
  }
  const primary = await primaryOrgId();
  if (!primary) return null;
  if (tieneConfigPropia(await filaDe(primary))) return null;
  const [org] = await db
    .select({ status: schema.organization.status })
    .from(schema.organization)
    .where(eq(schema.organization.id, primary))
    .limit(1);
  return org?.status === "active" ? primary : null;
}

// ---------------------------------------------------------------------------
// Administración (superusuario)
// ---------------------------------------------------------------------------

export type CerebroDto = {
  dispatchUrl: string | null;
  healthUrl: string | null;
  keyLast4: string | null;
  /** La organización principal sin configuración propia: manda el entorno. */
  usaEntorno: boolean;
  config: { active: boolean; host: string | null; problem: string | null };
};

export async function cerebroDto(organizationId: string): Promise<CerebroDto> {
  const row = await filaDe(organizationId);
  const config = await configDespachoDeOrg(organizationId);
  return {
    dispatchUrl: row?.dispatchUrl ?? null,
    healthUrl: row?.healthUrl ?? null,
    keyLast4: row?.keyLast4 ?? null,
    usaEntorno: !tieneConfigPropia(row) && organizationId === (await primaryOrgId()),
    config: {
      active: config.active,
      host: config.host,
      problem: config.active ? null : config.problem,
    },
  };
}

async function upsert(organizationId: string, values: Partial<Fila>): Promise<void> {
  await getDb()
    .insert(schema.brainConnection)
    .values({ id: newId("brainConnection"), organizationId, ...values })
    .onConflictDoUpdate({
      target: schema.brainConnection.organizationId,
      set: { ...values, updatedAt: new Date() },
    });
}

export async function guardarUrlsCerebro(
  organizationId: string,
  urls: { dispatchUrl: string | null; healthUrl: string | null }
): Promise<void> {
  await upsert(organizationId, urls);
}

/** Genera (o rota) la llave del bot. Devuelve la llave en claro UNA sola vez. */
export async function generarLlaveBot(organizationId: string): Promise<string> {
  const llave = `vk_${randomBytes(24).toString("base64url")}`;
  const enc = encryptSecret(llave);
  await upsert(organizationId, {
    keyCipher: enc.cipher,
    keyIv: enc.iv,
    keyTag: enc.tag,
    keyHash: hashLlave(llave),
    keyLast4: llave.slice(-4),
  });
  return llave;
}

export async function quitarLlaveBot(organizationId: string): Promise<void> {
  await upsert(organizationId, {
    keyCipher: null,
    keyIv: null,
    keyTag: null,
    keyHash: null,
    keyLast4: null,
  });
}
