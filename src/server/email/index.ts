import { isMockEnabled } from "@/lib/env";

/**
 * 068 — Conector de correo OPCIONAL (constitución II, patrón ADR-001).
 *
 * Apagado sin `SMTP_HOST`: entonces nadie recibe correos y la recuperación de
 * contraseña y las invitaciones se ofrecen como enlace copiable en /admin. Su
 * fallo jamás tumba la operación: `enviarCorreo` devuelve `false` y lo anota.
 *
 * `SMTP_HOST=mock` (solo con los mocks del entorno de pruebas) guarda los
 * correos en memoria para que los E2E lean el enlace (`/api/dev/mail-mock`).
 */

export type Correo = { para: string; asunto: string; texto: string; html?: string };

type Buzon = { enviados: (Correo & { at: string })[] };
const globalBuzon = globalThis as unknown as { __voceroMailMock?: Buzon };
export function buzonMock(): Buzon {
  if (!globalBuzon.__voceroMailMock) globalBuzon.__voceroMailMock = { enviados: [] };
  return globalBuzon.__voceroMailMock;
}

function leer(nombre: string): string | undefined {
  const v = process.env[nombre]?.trim();
  return v ? v : undefined;
}

function esMock(): boolean {
  return leer("SMTP_HOST") === "mock" && isMockEnabled();
}

/** ¿Hay manera de mandar correos? */
export function correoHabilitado(): boolean {
  const host = leer("SMTP_HOST");
  if (!host) return false;
  if (host === "mock") return isMockEnabled();
  return Boolean(leer("SMTP_USER") && leer("SMTP_PASS"));
}

/** Estado para el panel global (nunca la contraseña). */
export function estadoCorreo(): { habilitado: boolean; host: string | null; remitente: string | null } {
  return {
    habilitado: correoHabilitado(),
    host: leer("SMTP_HOST") ?? null,
    remitente: leer("SMTP_FROM") ?? leer("SMTP_USER") ?? null,
  };
}

let transporte: import("nodemailer").Transporter | null = null;

async function obtenerTransporte() {
  if (transporte) return transporte;
  const nodemailer = await import("nodemailer");
  const port = Number(leer("SMTP_PORT") ?? 465);
  transporte = nodemailer.createTransport({
    host: leer("SMTP_HOST"),
    port,
    secure: port === 465,
    auth: { user: leer("SMTP_USER"), pass: leer("SMTP_PASS") },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return transporte;
}

/** Manda un correo. `true` si salió; `false` (y un aviso sin secretos) si no. */
export async function enviarCorreo(correo: Correo): Promise<boolean> {
  if (!correoHabilitado()) return false;
  if (esMock()) {
    buzonMock().enviados.push({ ...correo, at: new Date().toISOString() });
    return true;
  }
  try {
    const t = await obtenerTransporte();
    await t.sendMail({
      from: leer("SMTP_FROM") ?? leer("SMTP_USER"),
      to: correo.para,
      subject: correo.asunto,
      text: correo.texto,
      html: correo.html,
    });
    return true;
  } catch (err) {
    console.error("[correo] no se pudo enviar:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Un correo sencillo con un botón. */
export function correoConEnlace(input: {
  para: string;
  asunto: string;
  saludo: string;
  cuerpo: string;
  boton: string;
  url: string;
  pie: string;
}): Correo {
  const texto = `${input.saludo}\n\n${input.cuerpo}\n\n${input.boton}: ${input.url}\n\n${input.pie}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#111">
<p>${escapar(input.saludo)}</p><p>${escapar(input.cuerpo)}</p>
<p><a href="${escapar(input.url)}" style="display:inline-block;background:#0d5bff;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">${escapar(input.boton)}</a></p>
<p style="font-size:13px;color:#555">Si el botón no abre, copia este enlace:<br>${escapar(input.url)}</p>
<p style="font-size:13px;color:#555">${escapar(input.pie)}</p></div>`;
  return { para: input.para, asunto: input.asunto, texto, html };
}
