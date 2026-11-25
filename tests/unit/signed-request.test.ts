import { describe, expect, it } from "vitest";
import { firmarSignedRequest, leerSignedRequest } from "@/lib/meta/signed-request";

const SECRETO = "secreto-de-la-app";

describe("signed_request de Meta (069)", () => {
  it("acepta una firma válida y devuelve el user_id", () => {
    const sr = firmarSignedRequest({ user_id: "1234567890", issued_at: 1700000000 }, SECRETO);
    expect(leerSignedRequest(sr, SECRETO)).toEqual({ userId: "1234567890", issuedAt: 1700000000 });
  });

  it("rechaza otra clave, una carga alterada y formatos rotos", () => {
    const sr = firmarSignedRequest({ user_id: "1" }, SECRETO);
    expect(leerSignedRequest(sr, "otra-clave")).toBeNull();
    const [firma] = sr.split(".");
    const otra = firmarSignedRequest({ user_id: "2" }, SECRETO).split(".")[1];
    expect(leerSignedRequest(`${firma}.${otra}`, SECRETO)).toBeNull();
    expect(leerSignedRequest("sin-punto", SECRETO)).toBeNull();
    expect(leerSignedRequest("a.b.c", SECRETO)).toBeNull();
    expect(leerSignedRequest(undefined, SECRETO)).toBeNull();
    expect(leerSignedRequest(sr, undefined)).toBeNull();
  });

  it("rechaza otro algoritmo y un user_id que no es numérico", () => {
    expect(leerSignedRequest(firmarSignedRequest({ algorithm: "HMAC-SHA1", user_id: "1" }, SECRETO), SECRETO)).toBeNull();
    expect(leerSignedRequest(firmarSignedRequest({ user_id: "1;drop" }, SECRETO), SECRETO)).toBeNull();
    expect(leerSignedRequest(firmarSignedRequest({}, SECRETO), SECRETO)).toBeNull();
  });
});
