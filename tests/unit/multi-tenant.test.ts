import { afterEach, describe, expect, it, vi } from "vitest";
import { sugerirSlug, validarSlug } from "@/lib/tenant-slug";
import { esSuperadmin, superadminEmails } from "@/server/tenants/superadmin";
import { appNavGroups } from "@/lib/nav";

/** 067 — Multi-tenant con superusuario: las piezas puras. */

describe("validarSlug (web ID)", () => {
  it.each(["acme", "panaderia-lupita", "a1b", "x".repeat(40), "tienda-2"])("acepta %s", (s) => {
    expect(validarSlug(s)).toEqual({ ok: true, slug: s });
  });

  it("normaliza mayúsculas y espacios", () => {
    expect(validarSlug("  Acme  ")).toEqual({ ok: true, slug: "acme" });
  });

  it.each(["ab", "-acme", "acme-", "ac me", "acmé", "a--b", "x".repeat(41), "", "a_b", "../x"])(
    "rechaza %s por formato",
    (s) => {
      expect(validarSlug(s)).toEqual({ ok: false, motivo: "formato" });
    }
  );

  it.each(["admin", "api", "login", "www"])("rechaza %s por reservado", (s) => {
    expect(validarSlug(s)).toEqual({ ok: false, motivo: "reservado" });
  });
});

describe("sugerirSlug", () => {
  it("quita acentos, espacios y símbolos", () => {
    expect(sugerirSlug("Panadería Lupita & Hijos")).toBe("panaderia-lupita-hijos");
  });
  it("lo sugerido siempre valida (o queda vacío)", () => {
    for (const n of ["Ñandú S.A.", "  ---  ", "Clínica Dental Sonrisas del Valle de Guatemala Norte"]) {
      const s = sugerirSlug(n);
      if (s.length >= 3) expect(validarSlug(s).ok).toBe(true);
    }
  });
});

describe("superusuario (SUPERADMIN_EMAILS)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sin la variable no hay superusuarios", () => {
    vi.stubEnv("SUPERADMIN_EMAILS", "");
    expect(superadminEmails().size).toBe(0);
    expect(esSuperadmin("alguien@ejemplo.com")).toBe(false);
  });

  it("lista separada por comas, sin distinguir mayúsculas ni espacios", () => {
    vi.stubEnv("SUPERADMIN_EMAILS", " Ana@Ejemplo.com, beto@ejemplo.com ,no-es-correo");
    expect([...superadminEmails()]).toEqual(["ana@ejemplo.com", "beto@ejemplo.com"]);
    expect(esSuperadmin("ANA@ejemplo.com")).toBe(true);
    expect(esSuperadmin("carla@ejemplo.com")).toBe(false);
    expect(esSuperadmin(null)).toBe(false);
  });
});

describe("menú: «Negocios» solo para el superusuario", () => {
  const hrefs = (superadmin: boolean) =>
    appNavGroups({ role: "owner", superadmin }).flatMap((g) => g.items.map((i) => i.href));

  it("un dueño normal no la ve", () => {
    expect(hrefs(false)).not.toContain("/admin");
  });
  it("el superusuario sí", () => {
    expect(hrefs(true)).toContain("/admin");
  });
});
