import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn(), schema: {} }));

import {
  cuerpoConModeloAutorizado,
  iaBloqueada,
  modeloEfectivo,
} from "@/server/platform/ia";

/** 068 · etapa 4 — Llave fija y modelos autorizados (las partes puras). */
describe("IA de la plataforma", () => {
  afterEach(() => {
    delete process.env.PLATFORM_AI_LOCK;
  });

  it("la llave fija se enciende solo a propósito", () => {
    expect(iaBloqueada()).toBe(false);
    for (const v of ["true", "1", "on", " TRUE "]) {
      process.env.PLATFORM_AI_LOCK = v;
      expect(iaBloqueada()).toBe(true);
    }
    process.env.PLATFORM_AI_LOCK = "false";
    expect(iaBloqueada()).toBe(false);
  });

  it("el modelo del agente vale solo si está autorizado", () => {
    const elegibles = ["base/m", "mock/rapido"];
    expect(modeloEfectivo("mock/rapido", elegibles, "base/m")).toBe("mock/rapido");
    expect(modeloEfectivo("caro/x", elegibles, "base/m")).toBe("base/m");
    expect(modeloEfectivo(null, elegibles, "base/m")).toBe("base/m");
    expect(modeloEfectivo(null, [], null)).toBeNull();
  });

  it("el proxy cambia un modelo no autorizado y deja pasar el resto", () => {
    const elegibles = ["base/m", "mock/caro"];
    const pedir = (model: unknown) => JSON.stringify({ model, messages: [{ role: "user", content: "hola" }] });
    expect(JSON.parse(cuerpoConModeloAutorizado(pedir("openai/gpt-x"), elegibles, "base/m")).model).toBe("base/m");
    expect(JSON.parse(cuerpoConModeloAutorizado(pedir(undefined), elegibles, "base/m")).model).toBe("base/m");
    const autorizado = pedir("mock/caro");
    expect(cuerpoConModeloAutorizado(autorizado, elegibles, "base/m")).toBe(autorizado);
    // Lo demás del cuerpo no se toca.
    expect(JSON.parse(cuerpoConModeloAutorizado(pedir("x/y"), elegibles, "base/m")).messages).toEqual([
      { role: "user", content: "hola" },
    ]);
  });

  it("sin lista o con un cuerpo que no es JSON, pasa tal cual", () => {
    expect(cuerpoConModeloAutorizado('{"model":"x/y"}', [], "base/m")).toBe('{"model":"x/y"}');
    expect(cuerpoConModeloAutorizado("no-json", ["base/m"], "base/m")).toBe("no-json");
    expect(cuerpoConModeloAutorizado("[1,2]", ["base/m"], "base/m")).toBe("[1,2]");
  });
});
