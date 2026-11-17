import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { normalizeMx } from "@/lib/meta/client";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { resolverEtapa } from "@/server/bot/stage";
import { createLeadForContact } from "@/server/inbox/lead-activity";
import { moveLeadToStage } from "@/server/leads/stage-history";

/**
 * Prospectos que llegan de un sistema externo de prospección (Sol, de SparkMind).
 *
 * Es una superficie de SERVICIO, como `/api/bot/*`, pero con su propia llave
 * (`PROSPECTOS_API_KEY`): quien puede dar de alta prospectos no tiene por qué
 * poder conducir conversaciones, y viceversa.
 *
 * Un prospecto puede no tener teléfono —muchos negocios solo publican correo o
 * formulario—. Esos viven en el canal `correo`, con identidad
 * `correo:<dirección>`: así caben en el índice único sin inventar un teléfono,
 * y ninguna ruta de mensajería los toma por un contacto de WhatsApp.
 */

const MIN_KEY_LENGTH = 16;
const FALLOS = { windowMs: 60_000, max: 30 };
const PRESUPUESTO = { windowMs: 60_000, max: 300 };

export function isProspectosKeyConfigured(): boolean {
  const key = process.env.PROSPECTOS_API_KEY;
  return typeof key === "string" && key.length >= MIN_KEY_LENGTH;
}

function llaveDe(req: Request): string | null {
  const directa = req.headers.get("x-api-key");
  if (directa) return directa;
  const auth = req.headers.get("authorization");
  const m = auth ? /^Bearer\s+(.+)$/i.exec(auth.trim()) : null;
  return m?.[1] ?? null;
}

function llaveValida(provista: string | null): boolean {
  const esperada = process.env.PROSPECTOS_API_KEY;
  if (!esperada || !isProspectosKeyConfigured() || !provista) return false;
  const a = Buffer.from(provista);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** null si pasa; si no, la respuesta 401/429 lista para devolver. */
export function requireProspectosKey(req: Request): Response | null {
  if (!llaveValida(llaveDe(req))) {
    const fallos = checkRateLimit(`prospectos-fail:${clientIp(req.headers)}`, FALLOS);
    return fallos.allowed
      ? apiError(401, "unauthorized", "No autorizado")
      : apiError(429, "rate_limited", "Demasiados intentos fallidos");
  }
  const rl = checkRateLimit("prospectos-api", PRESUPUESTO);
  if (!rl.allowed) return apiError(429, "rate_limited", "Demasiadas solicitudes");
  return null;
}

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

const texto = (max: number) => z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));
const url = z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Solo http(s)");

export const prospectoSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120),
    /** Dígitos con código de país; se aceptan espacios, guiones y "+" y se limpian. */
    telefono: texto(40),
    correo: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal("").transform(() => undefined)),
    sitio_web: url.optional().or(z.literal("").transform(() => undefined)),
    url_formulario: url.optional().or(z.literal("").transform(() => undefined)),
    sector: texto(60),
    ciudad: texto(80),
    /** Página donde se verificó el dato: obligatoria, sin fuente no hay prospecto. */
    fuente: url,
    motivo: texto(1000),
    /** Id del prospecto en el sistema de origen, para trazabilidad. */
    referencia_externa: texto(80),
    /** Nombre (o id) de la etapa del embudo. Si no existe, la primera abierta. */
    etapa: texto(80),
    /** El agente de IA de Vocero no le responde si escribe. Por defecto, sí responde. */
    pausar_ia: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.telefono && !telefonoValido(v.telefono)) {
      ctx.addIssue({ code: "custom", path: ["telefono"], message: "Teléfono con código de país, 7 a 15 dígitos (ej. 50222223333)" });
    }
    if (!v.telefono && !v.correo) {
      ctx.addIssue({ code: "custom", path: ["telefono"], message: "Hace falta teléfono o correo" });
    }
  });

export type ProspectoEntrada = z.infer<typeof prospectoSchema>;

export function limpiarTelefono(t: string): string {
  return t.replace(/[\s\-().+]/g, "");
}

export function telefonoValido(t: string): boolean {
  return /^\d{7,15}$/.test(limpiarTelefono(t));
}

/** Canal e identidad del contacto: WhatsApp si hay teléfono, `correo` si no. */
export function identidadDe(p: Pick<ProspectoEntrada, "telefono" | "correo">): {
  channel: "whatsapp" | "correo";
  waIdentity: string;
  phone: string | null;
} {
  if (p.telefono) {
    const phone = normalizeMx(limpiarTelefono(p.telefono));
    return { channel: "whatsapp", waIdentity: phone, phone };
  }
  return { channel: "correo", waIdentity: `correo:${p.correo!.toLowerCase()}`, phone: null };
}

/**
 * Lo nuevo se suma a la ficha sin borrar lo que el dueño ya capturó: un campo
 * que ya tiene valor no se pisa, salvo los de trazabilidad de Sol.
 */
export function fusionarFicha(
  previa: Record<string, unknown> | null | undefined,
  p: ProspectoEntrada
): Record<string, unknown> {
  const nueva: Record<string, unknown> = { ...(previa ?? {}) };
  const datos: Record<string, string | undefined> = {
    correo: p.correo,
    sitio_web: p.sitio_web,
    url_formulario: p.url_formulario,
    sector: p.sector,
    ciudad: p.ciudad,
    motivo_encaje: p.motivo,
  };
  for (const [k, v] of Object.entries(datos)) {
    if (v && (nueva[k] === undefined || nueva[k] === null || nueva[k] === "")) nueva[k] = v;
  }
  nueva.origen = "Sol";
  nueva.fuente = p.fuente;
  if (p.referencia_externa) nueva.sol_id = p.referencia_externa;
  return nueva;
}

/* ------------------------------------------------------------------ */
/* Alta o actualización                                                */
/* ------------------------------------------------------------------ */

export type ResultadoProspecto = {
  contactoId: string;
  leadId: string | null;
  etapa: string | null;
  nuevo: boolean;
  canal: "whatsapp" | "correo" | string;
};

export async function registrarProspecto(
  organizationId: string,
  p: ProspectoEntrada
): Promise<ResultadoProspecto> {
  const db = getDb();
  const id = identidadDe(p);

  // Mismo negocio = misma identidad, o el mismo correo guardado en la ficha
  // (un prospecto que primero llegó sin teléfono y después con él).
  const condiciones = [
    and(eq(schema.contact.channel, id.channel), eq(schema.contact.waIdentity, id.waIdentity)),
  ];
  if (p.correo) {
    condiciones.push(eq(schema.contact.waIdentity, `correo:${p.correo}`));
    condiciones.push(sql`${schema.contact.ficha} ->> 'correo' = ${p.correo}`);
  }
  const existentes = await db
    .select()
    .from(schema.contact)
    .where(and(eq(schema.contact.organizationId, organizationId), or(...condiciones)))
    .orderBy(asc(schema.contact.createdAt))
    .limit(1);

  let contacto = existentes[0];
  let nuevo = false;

  if (contacto) {
    const cambios: Partial<typeof schema.contact.$inferInsert> = {
      ficha: fusionarFicha(contacto.ficha as Record<string, unknown> | null, p),
      updatedAt: new Date(),
    };
    // Si antes solo tenía correo y ahora trae teléfono, pasa a WhatsApp.
    if (contacto.channel === "correo" && id.channel === "whatsapp") {
      cambios.channel = "whatsapp";
      cambios.waIdentity = id.waIdentity;
      cambios.phone = id.phone;
    }
    if (!contacto.notes && p.motivo) cambios.notes = `Prospecto de Sol: ${p.motivo}`;
    const filas = await db
      .update(schema.contact)
      .set(cambios)
      .where(eq(schema.contact.id, contacto.id))
      .returning();
    contacto = filas[0] ?? contacto;
  } else {
    const filas = await db
      .insert(schema.contact)
      .values({
        id: newId("contact"),
        organizationId,
        channel: id.channel,
        waIdentity: id.waIdentity,
        phone: id.phone,
        name: p.nombre,
        nameSource: "manual",
        notes: p.motivo ? `Prospecto de Sol: ${p.motivo}` : null,
        ficha: fusionarFicha(null, p),
        source: "otro",
        aiPaused: p.pausar_ia ?? false,
      })
      .onConflictDoNothing({
        target: [schema.contact.organizationId, schema.contact.channel, schema.contact.waIdentity],
      })
      .returning();
    if (filas[0]) {
      contacto = filas[0];
      nuevo = true;
    } else {
      // Carrera con otra alta simultánea: se toma la que ganó.
      const otra = await db
        .select()
        .from(schema.contact)
        .where(
          and(
            eq(schema.contact.organizationId, organizationId),
            eq(schema.contact.channel, id.channel),
            eq(schema.contact.waIdentity, id.waIdentity)
          )
        )
        .limit(1);
      contacto = otra[0]!;
    }
  }

  // Etapa: la pedida si existe; si no, la primera abierta.
  const etapas = await db
    .select({ id: schema.pipelineStage.id, name: schema.pipelineStage.name, position: schema.pipelineStage.position, kind: schema.pipelineStage.kind })
    .from(schema.pipelineStage)
    .where(eq(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));
  const pedida = p.etapa ? resolverEtapa(p.etapa, etapas) : null;

  const leads = await db
    .select({ id: schema.lead.id, stageId: schema.lead.stageId })
    .from(schema.lead)
    .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.contactId, contacto.id)))
    .limit(1);

  let leadId: string | null = leads[0]?.id ?? null;
  let stageId: string | null = leads[0]?.stageId ?? null;

  if (!leadId) {
    const creado = await createLeadForContact({
      organizationId,
      contactId: contacto.id,
      stageId: pedida?.id,
      source: "sistema",
    });
    leadId = creado?.id ?? null;
    stageId = creado?.stageId ?? null;
  } else if (pedida && pedida.id !== stageId && pedida.kind === "open") {
    // Solo se mueve hacia etapas abiertas: ganar o perder un trato lo decide una persona.
    const r = await moveLeadToStage({
      organizationId,
      leadId,
      toStageId: pedida.id,
      actorUserId: null,
      source: "sistema",
      lossReason: null,
      lossNote: null,
    });
    if (r.ok) stageId = pedida.id;
  }

  return {
    contactoId: contacto.id,
    leadId,
    etapa: etapas.find((e) => e.id === stageId)?.name ?? null,
    nuevo,
    canal: contacto.channel,
  };
}
