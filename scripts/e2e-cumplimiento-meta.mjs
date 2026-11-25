/**
 * Self-test E2E de comportamiento — 069, cumplimiento con Meta y Coexistence
 * (guion tests/e2e/us-cumplimiento-meta.md).
 *
 *   1. Páginas públicas sin sesión: /privacidad, /terminos, /eliminar-datos.
 *   2. Coexistence: el alta con el evento de la app WhatsApp Business no
 *      registra el número ni genera PIN, y guarda quién autorizó.
 *   3. Callbacks de Meta con `signed_request`: firma inválida → 400 sin tocar
 *      nada; desautorización → la conexión pide reconectar; eliminación de
 *      datos → se borra la conexión y la página pública da el estado por
 *      código. Repetir cada uno no rompe nada (idempotencia).
 *
 * Uso: node --env-file=.env.e2e-069 scripts/e2e-cumplimiento-meta.mjs
 * Requiere: app con WA_MOCK_ENABLED=true, META_GRAPH_BASE_URL al wa-mock,
 * META_APP_ID + META_EMBEDDED_CONFIG_ID + META_APP_SECRET, LEGAL_NAME y
 * LEGAL_CONTACT_EMAIL, y BD migrada.
 */
import { createHmac } from "node:crypto";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e069@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-123";
const SECRETO = process.env.META_APP_SECRET ?? "";
const LEGAL_NAME = process.env.LEGAL_NAME ?? "Vocero";
const LEGAL_MAIL = process.env.LEGAL_CONTACT_EMAIL ?? "";

let cookie = "";
let failures = 0;
let checks = 0;

function ok(name, cond, extra = "") {
  checks++;
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      origin: BASE,
      ...(cookie ? { cookie } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // no es JSON
  }
  return { res, json, text };
}

const b64u = (b) => Buffer.from(b).toString("base64url");
function firmar(carga, secreto = SECRETO) {
  const c = b64u(JSON.stringify({ algorithm: "HMAC-SHA256", issued_at: Math.floor(Date.now() / 1000), ...carga }));
  return `${createHmac("sha256", secreto).update(c).digest("base64url")}.${c}`;
}
/** Un callback de Meta: formulario con un solo campo, sin sesión ni cookie. */
const callback = (ruta, signed) =>
  fetch(`${BASE}${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ signed_request: signed }).toString(),
  });

const n = Date.now().toString().slice(-8);
const WABA = `7${n}1`;
const PN = `7${n}2`;
const UID = `9${n}01`;
const UID_AJENO = `9${n}02`;

const conexion = async () => (await api("/api/settings/whatsapp")).json?.connection ?? null;

async function paginasPublicas() {
  console.log("== Páginas públicas, sin sesión ==");
  for (const [ruta, texto] of [
    ["/privacidad", "Política de privacidad"],
    ["/terminos", "Términos del servicio"],
    ["/eliminar-datos", "Eliminación de datos"],
  ]) {
    const r = await fetch(`${BASE}${ruta}`, { redirect: "manual" });
    const html = await r.text();
    ok(`${ruta} responde 200 sin login`, r.status === 200, String(r.status));
    ok(`${ruta} tiene su título`, html.includes(texto));
    ok(`${ruta} firma con el nombre legal`, html.includes(LEGAL_NAME));
    if (LEGAL_MAIL) ok(`${ruta} muestra el correo de contacto`, html.includes(LEGAL_MAIL));
  }
  const inexistente = await (await fetch(`${BASE}/eliminar-datos?codigo=${"a".repeat(18)}`)).text();
  ok("un código desconocido no inventa una solicitud", inexistente.includes("No encontramos una solicitud"));
}

async function coexistence() {
  console.log("\n== Operador y Coexistence ==");
  let su = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Operador E2E 069" }),
  });
  if (!su.res.ok) {
    su = await api("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
  }
  ok("registro o login del operador", su.res.ok, su.text.slice(0, 200));

  await api("/api/dev/wa-mock/embedded", {
    method: "POST",
    body: JSON.stringify({
      wabaId: WABA,
      numeros: [{ id: PN, display_phone_number: "+51 955 000 069", verified_name: "Coexistence E2E" }],
    }),
  });
  const r = await api("/api/settings/whatsapp/embedded", {
    method: "POST",
    body: JSON.stringify({ code: `c069-${n}-uid${UID}`, wabaId: WABA, phoneNumberId: PN, pin: null, coexistence: true }),
  });
  ok("el alta por Coexistence responde 200", r.res.status === 200 && r.json?.connected === true, `${r.res.status} ${r.text.slice(0, 300)}`);
  ok("no registró el número (cero /register)", r.json?.registered === false && r.json?.coexistence === true);
  ok("no generó PIN", r.json?.generatedPin === undefined);
  const c = await conexion();
  ok("la conexión quedó guardada y conectada", c?.phoneNumberId === PN && c?.status === "connected", JSON.stringify(c));
}

async function callbacks() {
  console.log("\n== Callbacks de Meta: firma inválida ==");
  for (const ruta of ["/api/meta/desautorizar", "/api/meta/eliminar-datos"]) {
    const mala = await callback(ruta, firmar({ user_id: UID }, "otro-secreto"));
    ok(`${ruta}: firma ajena → 400`, mala.status === 400, String(mala.status));
    const vacia = await callback(ruta, "esto-no-es-un-signed-request");
    ok(`${ruta}: formato roto → 400`, vacia.status === 400, String(vacia.status));
    const sinCampo = await fetch(`${BASE}${ruta}`, { method: "POST", body: "" });
    ok(`${ruta}: sin signed_request → 400`, sinCampo.status === 400, String(sinCampo.status));
  }
  ok("nada cambió con las firmas malas", (await conexion())?.status === "connected");

  console.log("\n== Desautorización ==");
  const ajeno = await callback("/api/meta/desautorizar", firmar({ user_id: UID_AJENO }));
  ok("un usuario sin conexiones: 200 y no toca otras", ajeno.status === 200 && (await conexion())?.status === "connected");
  const d1 = await callback("/api/meta/desautorizar", firmar({ user_id: UID }));
  ok("desautorizar → 200", d1.status === 200, String(d1.status));
  ok("la conexión pide reconectar", (await conexion())?.status === "reconnect_required", JSON.stringify(await conexion()));
  const d2 = await callback("/api/meta/desautorizar", firmar({ user_id: UID }));
  ok("repetirla es idempotente", d2.status === 200 && (await conexion())?.status === "reconnect_required");

  console.log("\n== Eliminación de datos ==");
  const e1 = await callback("/api/meta/eliminar-datos", firmar({ user_id: UID }));
  const j1 = await e1.json().catch(() => null);
  ok("responde 200 con url y confirmation_code (lo que pide Meta)", e1.status === 200 && /^[a-f0-9]{18}$/.test(j1?.confirmation_code ?? "") && String(j1?.url).includes(`/eliminar-datos?codigo=${j1?.confirmation_code}`), JSON.stringify(j1));
  ok("la conexión y su token se borraron", (await conexion()) === null, JSON.stringify(await conexion()));
  const pagina = await (await fetch(`${BASE}/eliminar-datos?codigo=${j1?.confirmation_code}`)).text();
  ok("la página pública muestra la solicitud completada con su código", pagina.includes("Solicitud completada") && pagina.includes(j1?.confirmation_code) && pagina.includes("Se eliminaron 1 conexión"), pagina.slice(0, 200));
  ok("no revela el user_id de Meta", !pagina.includes(UID));
  const e2 = await callback("/api/meta/eliminar-datos", firmar({ user_id: UID }));
  const j2 = await e2.json().catch(() => null);
  ok("repetirla da otro código y «sin datos»", e2.status === 200 && j2?.confirmation_code !== j1?.confirmation_code);
  const p2 = await (await fetch(`${BASE}/eliminar-datos?codigo=${j2?.confirmation_code}`)).text();
  ok("y lo dice la página", p2.includes("Solicitud recibida") && p2.includes("No encontramos datos"));
}

try {
  await paginasPublicas();
  await coexistence();
  await callbacks();
} catch (err) {
  ok("sin excepciones", false, err instanceof Error ? err.stack : String(err));
}

console.log(`\n${checks - failures}/${checks} checks`);
process.exit(failures ? 1 : 0);
