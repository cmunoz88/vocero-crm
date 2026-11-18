/**
 * 067 — El «web ID» de un tenant: el segmento de su URL (`/t/{slug}`).
 * Puro: lo usan la API, la UI y las pruebas.
 */

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Segmentos que chocarían con rutas o confundirían a quien lee la URL. */
export const SLUGS_RESERVADOS = new Set([
  "admin",
  "api",
  "app",
  "login",
  "logout",
  "register",
  "settings",
  "static",
  "public",
  "www",
  "vocero",
  "superadmin",
  "root",
  "system",
  "t",
]);

export type SlugInvalido = "formato" | "reservado";

export function validarSlug(raw: string): { ok: true; slug: string } | { ok: false; motivo: SlugInvalido } {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_RE.test(slug) || slug.includes("--")) return { ok: false, motivo: "formato" };
  if (SLUGS_RESERVADOS.has(slug)) return { ok: false, motivo: "reservado" };
  return { ok: true, slug };
}

/** Sugerencia a partir del nombre del negocio («Panadería Lupita» → `panaderia-lupita`). */
export function sugerirSlug(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
