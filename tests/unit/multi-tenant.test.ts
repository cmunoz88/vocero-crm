import { describe, expect, it } from "vitest";
import { sugerirSlug, validarSlug } from "@/lib/tenant-slug";
import { baseDeUsername, normalizarUsername, usernameValido } from "@/server/platform/usernames";
import { generarPassword, revelacionHabilitada } from "@/server/platform/optimus";
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

describe("068 — nombres de usuario", () => {
  it("deriva del correo: sin acentos, minúsculas, solo [a-z0-9_.]", () => {
    expect(baseDeUsername("Ana.López@ejemplo.com")).toBe("ana.lopez");
    expect(baseDeUsername("juan perez")).toBe("juan.perez");
    expect(baseDeUsername("x+tag@ejemplo.com")).toBe("xtag");
    expect(baseDeUsername("a@b.c")).toBe("ausuario");
  });
  it("lo derivado siempre es un usuario válido", () => {
    for (const f of ["a@b.c", "---@x.com", "Ñandú@x.com", "muy.largo.".repeat(10) + "@x.com"]) {
      expect(usernameValido(baseDeUsername(f))).toBe(true);
    }
  });
  it("valida 3-30 de letras, números, _ y .", () => {
    expect(usernameValido("Optimus")).toBe(true);
    expect(usernameValido("ab")).toBe(false);
    expect(usernameValido("con espacio")).toBe(false);
    expect(usernameValido("con@arroba")).toBe(false);
    expect(normalizarUsername(" Optimus ")).toBe("optimus");
  });
});

describe("068 — contraseña inicial de Optimus", () => {
  it("20 caracteres, sin ambiguos, distinta cada vez", () => {
    const a = generarPassword();
    const b = generarPassword();
    expect(a).toHaveLength(20);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/[0O1lI]/);
  });
  it("la vista única exige un token de 32+ caracteres", () => {
    expect(revelacionHabilitada({})).toBe(false);
    expect(revelacionHabilitada({ SETUP_REVEAL_TOKEN: "corto" })).toBe(false);
    expect(revelacionHabilitada({ SETUP_REVEAL_TOKEN: "x".repeat(32) })).toBe(true);
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
