import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetRateLimit } from "@/lib/rate-limit";
import {
  fusionarFicha,
  identidadDe,
  prospectoSchema,
  requireProspectosKey,
  telefonoValido,
} from "@/server/servicio/prospectos";

/** Prospectos de Sol: validación, identidad, ficha y llave del servicio. */

const base = {
  nombre: "Clínica Sonrisa",
  fuente: "https://sonrisa.gt/contacto",
};

describe("prospectoSchema", () => {
  it("exige teléfono o correo", () => {
    const r = prospectoSchema.safeParse(base);
    expect(r.success).toBe(false);
  });

  it("acepta solo correo y lo pasa a minúsculas", () => {
    const r = prospectoSchema.safeParse({ ...base, correo: "Hola@Sonrisa.GT" });
    expect(r.success && r.data.correo).toBe("hola@sonrisa.gt");
  });

  it("rechaza un teléfono sin código de país o con letras", () => {
    expect(prospectoSchema.safeParse({ ...base, telefono: "123" }).success).toBe(false);
    expect(prospectoSchema.safeParse({ ...base, telefono: "abc12345678" }).success).toBe(false);
  });

  it("acepta teléfono con espacios, guiones y +", () => {
    expect(prospectoSchema.safeParse({ ...base, telefono: "+502 2222-3333" }).success).toBe(true);
  });

  it("la fuente es obligatoria y solo http(s)", () => {
    expect(prospectoSchema.safeParse({ nombre: "X", correo: "a@b.gt" }).success).toBe(false);
    expect(prospectoSchema.safeParse({ nombre: "X", correo: "a@b.gt", fuente: "ftp://x.gt" }).success).toBe(false);
  });

  it("los vacíos se tratan como ausentes", () => {
    const r = prospectoSchema.safeParse({ ...base, correo: "a@b.gt", telefono: "", sitio_web: "" });
    expect(r.success).toBe(true);
  });
});

describe("identidadDe", () => {
  it("con teléfono: WhatsApp, dígitos limpios", () => {
    expect(identidadDe({ telefono: "+502 2222-3333" })).toEqual({
      channel: "whatsapp",
      waIdentity: "50222223333",
      phone: "50222223333",
    });
  });

  it("sin teléfono: canal correo con identidad correo:<dirección>", () => {
    expect(identidadDe({ correo: "Info@RoDa.com" })).toEqual({
      channel: "correo",
      waIdentity: "correo:info@roda.com",
      phone: null,
    });
  });

  it("telefonoValido", () => {
    expect(telefonoValido("50222223333")).toBe(true);
    expect(telefonoValido("12")).toBe(false);
  });
});

describe("fusionarFicha", () => {
  const p = prospectoSchema.parse({
    ...base,
    correo: "hola@sonrisa.gt",
    sector: "clinicas",
    motivo: "Agenda por WhatsApp",
    referencia_externa: "7",
  });

  it("no pisa lo que el dueño ya capturó", () => {
    const f = fusionarFicha({ sector: "dental premium", presupuesto: "alto" }, p);
    expect(f.sector).toBe("dental premium");
    expect(f.presupuesto).toBe("alto");
    expect(f.correo).toBe("hola@sonrisa.gt");
  });

  it("marca el origen y la trazabilidad", () => {
    const f = fusionarFicha(null, p);
    expect(f).toMatchObject({ origen: "Sol", fuente: base.fuente, sol_id: "7", motivo_encaje: "Agenda por WhatsApp" });
  });
});

describe("requireProspectosKey", () => {
  const original = process.env.PROSPECTOS_API_KEY;
  const req = (headers: Record<string, string>) =>
    new Request("http://local/api/servicio/prospectos", { method: "POST", headers });

  beforeEach(() => {
    resetRateLimit();
    process.env.PROSPECTOS_API_KEY = "llave-de-prueba-suficientemente-larga";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.PROSPECTOS_API_KEY;
    else process.env.PROSPECTOS_API_KEY = original;
  });

  it("deja pasar la llave correcta por X-API-Key o Bearer", () => {
    expect(requireProspectosKey(req({ "x-api-key": "llave-de-prueba-suficientemente-larga" }))).toBeNull();
    expect(requireProspectosKey(req({ authorization: "Bearer llave-de-prueba-suficientemente-larga" }))).toBeNull();
  });

  it("401 con llave incorrecta o ausente", () => {
    expect(requireProspectosKey(req({ "x-api-key": "otra" }))?.status).toBe(401);
    expect(requireProspectosKey(req({}))?.status).toBe(401);
  });

  it("sin llave configurada (o corta) todo es 401", () => {
    process.env.PROSPECTOS_API_KEY = "corta";
    expect(requireProspectosKey(req({ "x-api-key": "corta" }))?.status).toBe(401);
  });

  it("429 después de muchos intentos fallidos", () => {
    let ultima: Response | null = null;
    for (let i = 0; i < 31; i++) ultima = requireProspectosKey(req({ "x-api-key": "mala" }));
    expect(ultima?.status).toBe(429);
  });
});
