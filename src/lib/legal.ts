import { getEnv } from "@/lib/env";

/** 069 — Quién firma las páginas públicas y a dónde escribirle. */
export function datosLegales() {
  const env = getEnv();
  return {
    nombre: env.LEGAL_NAME?.trim() || "Vocero",
    correo: env.LEGAL_CONTACT_EMAIL?.trim() || null,
    base: env.APP_BASE_URL.replace(/\/$/, ""),
    actualizado: "24 de noviembre de 2026",
  };
}
