/**
 * Self-test E2E de 068 · etapa 4 — panel global, IA por negocio, llave fija
 * y modelos autorizados. La app corre con PLATFORM_AI_LOCK=true (llave fija):
 *   bash reset-db.sh .env.e2e-068-lock
 *   node --env-file=.env.e2e-068-lock scripts/e2e-plataforma.mjs
 */
import postgres from "postgres";
import { apagarAgente, encenderAgente, levantarCerebroFalso } from "./lib/cerebro-falso.mjs";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const ENV_KEY = process.env.BOT_API_KEY;
const sql = postgres(process.env.DATABASE_URL, { max: 2 });
const RUN = Date.now().toString(36);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let checks = 0;
let failures = 0;
function ok(name, cond, extra = "") {
  checks++;
  if (cond) console.log(`  OK  ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra).slice(0, 400)}` : ""}`);
  }
}
const ipFalsa = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;
function sesion() {
  let cookie = "";
  const ip = ipFalsa();
  const api = async (ruta, opts = {}) => {
    const res = await fetch(`${BASE}${ruta}`, {
      redirect: "manual",
      ...opts,
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip, ...(cookie ? { cookie } : {}), ...(opts.headers ?? {}) },
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    let json = null;
    let text = "";
    try {
      text = await res.clone().text();
      json = JSON.parse(text);
    } catch {}
    return { res, json, text, status: res.status };
  };
  return { api, entrar: (u, p) => api("/api/auth/sign-in/username", { method: "POST", body: JSON.stringify({ username: u, password: p }) }) };
}
const json = (method, body) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const bot = (ruta, opts = {}) =>
  fetch(`${BASE}${ruta}`, { ...opts, headers: { "content-type": "application/json", "x-api-key": ENV_KEY, ...(opts.headers ?? {}) } }).then(async (r) => ({
    status: r.status,
    json: await r.json().catch(() => null),
  }));
const inbound = (pn, from, text) =>
  fetch(`${BASE}/api/dev/wa-mock/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phoneNumberId: pn, from, name: "Cliente", text, waMessageId: `wamid.068p.${RUN}.${Math.random().toString(36).slice(2)}` }),
  });
async function esperar(cond, ms = 15000, paso = 400) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await cond();
    if (v || Date.now() > fin) return v;
    await sleep(paso);
  }
}

async function main() {
  console.log(`Self-test 068 · panel global e IA contra ${BASE}`);
  const a = sesion();
  let r = await a.api("/api/auth/sign-up/email", json("POST", { email: `dueno-${RUN}@x.test`, password: "password-dueno-1", name: "Dueño A" }));
  ok("el dueño A se registra (principal)", r.res.ok, r.json);
  r = await sesion().api("/api/setup/credenciales", json("POST", { token: process.env.SETUP_REVEAL_TOKEN }));
  OPT = r.json?.password ?? "";
  const su = sesion();
  ok("Optimus entra", (await su.entrar("optimus", OPT)).res.ok);
  r = await su.api("/api/admin/tenants", json("POST", {
    name: "Negocio B",
    slug: `b-${RUN}`,
    owner: { name: "Dueño B", email: `b-${RUN}@x.test`, username: `duenob_${RUN}`.slice(0, 30), password: "password-dueno-b" },
  }));
  const B = r.json?.tenant ?? r.json;
  ok("Optimus crea el negocio B", r.status === 201, r.json);
  const b = sesion();
  ok("el dueño B entra", (await b.entrar(`duenob_${RUN}`.slice(0, 30), "password-dueno-b")).res.ok);
  const tenants = (await su.api("/api/admin/tenants")).json?.tenants ?? [];
  const A = tenants.find((t) => t.isPrimary);
  const idB = B?.id ?? tenants.find((t) => !t.isPrimary)?.id;

  console.log("\n== Panel global: solo el superadministrador ==");
  ok("anónimo → 404", (await sesion().api("/api/admin/plataforma")).status === 404);
  ok("un dueño → 404", (await a.api("/api/admin/plataforma")).status === 404);
  ok("un dueño no apaga la IA de otro negocio (404)", (await a.api(`/api/admin/tenants/${idB}/ia`, json("PATCH", { enabled: false }))).status === 404);
  ok("un dueño no cambia los modelos (404)", (await a.api("/api/admin/plataforma", json("PUT", { modelos: ["x/y"] }))).status === 404);

  // Algo de tráfico para las cifras.
  const PN = `PN-P-${RUN}`;
  await a.api("/api/settings/whatsapp", json("PUT", { wabaId: `W-${RUN}`, phoneNumberId: PN, token: "tok-p" }));
  await inbound(PN, "50255557777", "hola");
  await esperar(async () => ((await a.api("/api/conversations")).json?.conversations ?? []).length > 0);

  r = await su.api("/api/admin/plataforma");
  ok("Optimus ve el panel", r.status === 200, r.json);
  const p = r.json;
  ok("totales: 2 negocios, 1 número, 1 conversación", p?.totales?.negocios === 2 && p.totales.numeros === 1 && p.totales.conversaciones === 1, p?.totales);
  ok("mensajes de los últimos 30 días", p?.totales?.mensajes30d >= 1, p?.totales);
  ok("integraciones: IA con llave fija y modelo de la plataforma", p?.integraciones?.ia?.bloqueada === true && p.integraciones.ia.configurada && p.integraciones.ia.modelo === process.env.OPENROUTER_MODEL, p?.integraciones?.ia);
  const tok = process.env.OPENROUTER_API_TOKEN;
  ok("de la llave solo salen los últimos 4", p?.integraciones?.ia?.last4 === tok.slice(-4) && !r.text.includes(tok));
  ok("integraciones: correo y cerebro", typeof p?.integraciones?.correo?.habilitado === "boolean" && p?.integraciones?.cerebro?.activo === true, p?.integraciones);
  r = await su.api("/api/admin/tenants");
  const tA = r.json?.tenants?.find((t) => t.id === A?.id);
  ok("cada negocio trae sus cifras (sin contenido)", tA?.stats?.conversaciones === 1 && tA.stats.numeros === 1 && tA.stats.ia === false && !r.text.includes("hola"), tA?.stats);

  console.log("\n== Llave fija: los dueños no la cambian ==");
  r = await a.api("/api/settings/ai");
  ok("Ajustes → IA dice que la administra la plataforma", r.status === 200 && r.json?.bloqueada === true, r.json);
  r = await a.api("/api/settings/ai", json("PUT", { preset: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model: "x/y", token: "sk-or-propia-1234567890" }));
  ok("guardar una llave propia → 403", r.status === 403 && r.json?.error?.code === "ia_de_la_plataforma", r.json);
  ok("borrar la de la plataforma → 403", (await a.api("/api/settings/ai", json("DELETE"))).status === 403);
  const [{ n: filasIa }] = await sql`select count(*)::int n from ai_credentials`;
  ok("no se guardó ninguna llave de negocio", filasIa === 0);
  r = await a.api("/settings/ai");
  ok("la pantalla lo explica", r.text.includes("la administra la plataforma"), r.status);

  console.log("\n== Modelos autorizados ==");
  ok("modelo inválido → 422", (await su.api("/api/admin/plataforma", json("PUT", { modelos: ["no vale"] }))).status === 422);
  r = await su.api("/api/admin/plataforma", json("PUT", { modelos: ["mock/rapido", "mock/caro", "mock/rapido"] }));
  ok("Optimus autoriza dos (sin duplicados)", r.status === 200 && r.json?.modelos?.join() === "mock/rapido,mock/caro", r.json);
  r = await a.api("/api/agents");
  ok("el dueño ve los elegibles: el de la plataforma + los autorizados", r.json?.modelos?.join() === `${process.env.OPENROUTER_MODEL},mock/rapido,mock/caro`, r.json?.modelos);
  const principal = r.json?.agentes?.find((x) => x.isDefault)?.id;
  ok("un modelo no autorizado → 422", (await a.api(`/api/agents/${principal}`, json("PATCH", { model: "openai/gpt-x" }))).status === 422);
  ok("el principal elige mock/rapido", (await a.api(`/api/agents/${principal}`, json("PATCH", { model: "mock/rapido" }))).status === 200);
  ok("…pero en esa ruta solo puede cambiar el modelo (409)", (await a.api(`/api/agents/${principal}`, json("PATCH", { name: "otro" }))).status === 409);
  r = await bot("/api/bot/profile");
  ok("el cerebro piensa con mock/rapido", r.json?.llm?.model === "mock/rapido", r.json?.llm);
  r = await bot("/api/bot/llm/chat/completions", json("POST", { model: "openai/gpt-caro", messages: [{ role: "user", content: "hola" }] }));
  ok("el proxy cambia un modelo no autorizado por el de la plataforma", r.status === 200 && r.json?.model === process.env.OPENROUTER_MODEL, r.json);
  r = await bot("/api/bot/llm/chat/completions", json("POST", { model: "mock/caro", messages: [{ role: "user", content: "hola" }] }));
  ok("…y deja pasar uno autorizado", r.status === 200 && r.json?.model === "mock/caro", r.json);
  await su.api("/api/admin/plataforma", json("PUT", { modelos: ["mock/caro"] }));
  r = await bot("/api/bot/profile");
  ok("si Optimus retira mock/rapido, el agente vuelve al de la plataforma", r.json?.llm?.model === process.env.OPENROUTER_MODEL, r.json?.llm);

  console.log("\n== IA de un negocio desde /admin ==");
  r = await su.api(`/api/admin/tenants/${idB}/ia`, json("PATCH", { enabled: true }));
  ok("encender la IA de B sin cerebro → 409", r.status === 409 && r.json?.error?.code === "sin_cerebro", r.json);
  const cerebro = await levantarCerebroFalso({ base: BASE, botKey: ENV_KEY });
  try {
    let enc = null;
    for (let i = 0; i < 25 && (!enc || enc.status === 409); i++) {
      enc = await su.api(`/api/admin/tenants/${A.id}/ia`, json("PATCH", { enabled: true }));
      if (enc.status === 409) await sleep(1000);
    }
    ok("Optimus enciende la IA de A (su cerebro contesta)", enc?.status === 200, enc?.json);
    const conv = ((await a.api("/api/conversations")).json?.conversations ?? [])[0];
    await inbound(PN, "50255557777", "¿tienen envíos?");
    ok("con la IA encendida, se despacha", Boolean(await esperar(() => cerebro.de(conv.id).length > 0, 20000)));
    ok("Optimus apaga la IA de A", (await su.api(`/api/admin/tenants/${A.id}/ia`, json("PATCH", { enabled: false }))).status === 200);
    ok("el dueño la ve apagada", (await a.api("/api/agent/profile")).json?.profile?.enabled === false);
    const antes = cerebro.de(conv.id).length;
    await inbound(PN, "50255557777", "¿hola?");
    await sleep(5000);
    ok("apagada: ya no se despacha", cerebro.de(conv.id).length === antes, cerebro.de(conv.id).length - antes);
    r = await encenderAgente(a.api);
    ok("el dueño puede volver a encenderla", r.res.ok, r.json);
    const acciones = (await sql`select action, organization_id from audit_log`).map((x) => `${x.action}|${x.organization_id}`);
    ok("la bitácora registra quién apagó la IA de qué negocio", acciones.includes(`admin PATCH /tenants/${A.id}/ia|${A.id}`), acciones.filter((x) => x.includes("/ia")));
    ok("…y el cambio de modelos", acciones.some((x) => x.startsWith("admin PUT /plataforma")));
  } finally {
    await apagarAgente(a.api);
    await cerebro.esperar();
    await cerebro.apagar();
  }

  console.log("\n== Navegador: el panel ==");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ baseURL: BASE })).newPage();
    await page.goto("/login");
    await page.fill("#username", "optimus");
    await page.fill("#password", OPT);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => u.pathname === "/admin", { timeout: 20000 });
    await page.getByTestId("totales").waitFor({ timeout: 15000 });
    ok("UI: el panel muestra las cifras", (await page.getByTestId("totales").textContent())?.includes("Conversaciones"));
    await page.fill("#modelo-nuevo", "mock/nuevo");
    await page.getByRole("button", { name: "Autorizar" }).click();
    ok("UI: Optimus autoriza un modelo", await page.getByTestId("modelos").getByText("mock/nuevo").waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
    await page.screenshot({ path: ".tmp-e2e-plataforma.png", fullPage: true });
  } catch (err) {
    ok("navegador sin errores", false, String(err).slice(0, 300));
  } finally {
    await browser.close();
  }

  console.log(`\n${checks - failures}/${checks} checks OK`);
  await sql.end();
  process.exit(failures ? 1 : 0);
}

let OPT = "";
main().catch(async (err) => {
  console.error(err);
  await sql.end().catch(() => {});
  process.exit(1);
});
