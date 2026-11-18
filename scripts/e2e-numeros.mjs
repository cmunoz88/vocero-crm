/**
 * Self-test E2E de 068 · etapa 3 — varios números y varios agentes por negocio.
 * Base limpia, mocks encendidos, BOT_API_KEY + BRAIN_DISPATCH_URL locales y
 * SETUP_REVEAL_TOKEN:
 *   node --env-file=.env.e2e-067 scripts/e2e-numeros.mjs
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
    try {
      json = await res.clone().json();
    } catch {}
    return { res, json, status: res.status };
  };
  return { api, entrar: (u, p) => api("/api/auth/sign-in/username", { method: "POST", body: JSON.stringify({ username: u, password: p }) }) };
}
const json = (method, body) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const bot = (ruta) =>
  fetch(`${BASE}${ruta}`, { headers: { "x-api-key": ENV_KEY } }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
const inbound = (pn, from, text) =>
  fetch(`${BASE}/api/dev/wa-mock/inbound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phoneNumberId: pn, from, name: `Cliente ${from.slice(-4)}`, text, waMessageId: `wamid.068n.${RUN}.${Math.random().toString(36).slice(2)}` }),
  });
const outbox = async () => (await fetch(`${BASE}/api/dev/wa-mock/outbox`).then((r) => r.json())).outbox ?? [];
async function esperar(cond, ms = 15000, paso = 400) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await cond();
    if (v || Date.now() > fin) return v;
    await sleep(paso);
  }
}

async function main() {
  console.log(`Self-test 068 · números y agentes contra ${BASE}`);
  await fetch(`${BASE}/api/dev/wa-mock/outbox`, { method: "DELETE" });

  // El dueño de la principal (primer registro) y Optimus.
  const a = sesion();
  let r = await a.api("/api/auth/sign-up/email", json("POST", { email: `dueno-${RUN}@x.test`, password: "password-dueno-1", name: "Dueño A" }));
  ok("el dueño A se registra (principal)", r.res.ok, r.json);
  r = await sesion().api("/api/setup/credenciales", json("POST", { token: process.env.SETUP_REVEAL_TOKEN }));
  const su = sesion();
  ok("Optimus entra", (await su.entrar("optimus", r.json?.password ?? "")).res.ok);
  r = await su.api("/api/admin/tenants", json("POST", {
    name: "Negocio B",
    slug: `b-${RUN}`,
    owner: { name: "Dueño B", email: `b-${RUN}@x.test`, username: `duenob_${RUN}`.slice(0, 30), password: "password-dueno-b" },
  }));
  ok("Optimus crea el negocio B", r.status === 201, r.json);
  const b = sesion();
  ok("el dueño B entra", (await b.entrar(`duenob_${RUN}`.slice(0, 30), "password-dueno-b")).res.ok);

  console.log("\n== Varios números en un negocio ==");
  const PN1 = `PN1-${RUN}`;
  const PN2 = `PN2-${RUN}`;
  r = await a.api("/api/settings/whatsapp", json("PUT", { wabaId: `WABA-${RUN}`, phoneNumberId: PN1, token: "tok-uno" }));
  ok("A conecta su número principal", r.res.ok, r.json);
  r = await a.api("/api/settings/numbers", json("POST", { label: "Soporte", wabaId: `WABA-${RUN}`, phoneNumberId: PN2, token: "tok-dos-1234" }));
  ok("A agrega un segundo número → 201", r.status === 201, r.json);
  r = await a.api("/api/settings/numbers");
  const nums = r.json?.numeros ?? [];
  ok("A tiene 2 números, el primero es el principal", nums.length === 2 && nums[0]?.phoneNumberId === PN1 && nums[0]?.isPrimary && !nums[1]?.isPrimary, nums);
  ok("el token no sale: solo sus últimos 4", nums[1]?.tokenLast4 === "1234" && !JSON.stringify(r.json).includes("tok-dos"));
  const [{ c: cifrado }] = await sql`select count(*)::int c from meta_credentials where token_cipher like '%tok-dos%'`;
  ok("el token queda cifrado en la base", cifrado === 0);
  const num2 = nums.find((n) => n.phoneNumberId === PN2);
  ok("validación: falta el token → 422", (await a.api("/api/settings/numbers", json("POST", { wabaId: "w", phoneNumberId: "p" }))).status === 422);

  console.log("\n== Aislamiento entre negocios ==");
  r = await b.api("/api/settings/numbers", json("POST", { wabaId: `WABA-B-${RUN}`, phoneNumberId: PN2, token: "tok-b" }));
  ok("B no puede conectar un número de A (409, sin decir de quién)", r.status === 409 && !JSON.stringify(r.json).includes("Dueño A"), r.json);
  ok("B no ve los números de A", ((await b.api("/api/settings/numbers")).json?.numeros ?? []).length === 0);
  ok("B no puede cambiar un número de A (404)", (await b.api(`/api/settings/numbers/${num2?.id}`, json("PATCH", { label: "mío" }))).status === 404);
  ok("B no puede quitar un número de A (404)", (await b.api(`/api/settings/numbers/${num2?.id}`, json("DELETE"))).status === 404);

  console.log("\n== Una conversación por número ==");
  const CLIENTE = "50255551234";
  await inbound(PN1, CLIENTE, "hola por el principal");
  await inbound(PN2, CLIENTE, "hola por soporte");
  const convs = await esperar(async () => {
    const c = (await a.api("/api/conversations")).json?.conversations ?? [];
    return c.length >= 2 ? c : null;
  });
  ok("el mismo cliente por dos números → dos conversaciones", convs?.length === 2, convs?.length);
  const filas = await sql`select id, wa_phone_number_id from conversation where organization_id = (select organization_id from meta_credentials where phone_number_id = ${PN1})`;
  const conv1 = filas.find((f) => f.wa_phone_number_id === PN1)?.id;
  const conv2 = filas.find((f) => f.wa_phone_number_id === PN2)?.id;
  ok("cada conversación recuerda su número", Boolean(conv1 && conv2));
  await inbound(PN2, CLIENTE, "otra vez por soporte");
  await sleep(1500);
  ok("otro mensaje al mismo número no abre otra conversación", ((await a.api("/api/conversations")).json?.conversations ?? []).length === 2);
  ok("B no ve esas conversaciones", ((await b.api("/api/conversations")).json?.conversations ?? []).length === 0);
  const tablero = (await a.api("/api/pipeline/board")).json?.leads ?? [];
  ok("el tablero no duplica al cliente (un lead)", tablero.length === 1, tablero.length);

  r = await a.api(`/api/conversations/${conv2}/messages`, json("POST", { text: "te contesto desde soporte" }));
  ok("A contesta en la conversación de soporte", r.res.ok, r.json);
  let sale = await esperar(async () => (await outbox()).find((m) => JSON.stringify(m).includes("te contesto desde soporte")));
  ok("…y sale desde el número de soporte", sale?.phoneNumberId === PN2, sale);
  r = await a.api(`/api/conversations/${conv1}/messages`, json("POST", { text: "te contesto desde el principal" }));
  sale = await esperar(async () => (await outbox()).find((m) => JSON.stringify(m).includes("te contesto desde el principal")));
  ok("la del principal sale desde el principal", sale?.phoneNumberId === PN1, sale);

  console.log("\n== Varios agentes ==");
  r = await a.api("/api/agents");
  ok("A empieza con un agente, el principal, en modo compartido", r.json?.agentes?.length === 1 && r.json.agentes[0].isDefault && r.json.modo === "compartido", r.json);
  const principalId = r.json?.agentes?.[0]?.id;
  r = await a.api("/api/agents", json("POST", { name: "Sofía Soporte" }));
  ok("A crea un segundo agente", r.status === 201, r.json);
  const sofia = r.json?.id;
  ok("B no ve los agentes de A", ((await b.api("/api/agents")).json?.agentes ?? []).every((x) => x.id !== sofia));
  r = await b.api("/api/agents");
  const agenteB = r.json?.agentes?.[0]?.id;
  ok("A no puede asignar a su número un agente de B (404)", (await a.api(`/api/settings/numbers/${num2?.id}`, json("PATCH", { agentProfileId: agenteB }))).status === 404);
  ok("B no puede editar el agente de A (404)", (await b.api(`/api/agents/${sofia}`, json("PATCH", { name: "robado" }))).status === 404);
  ok("el principal no se borra (409)", (await a.api(`/api/agents/${principalId}`, json("DELETE"))).status === 409);
  ok("A pasa a «un agente por número»", (await a.api("/api/agents", json("PATCH", { modo: "por_numero" }))).status === 200);
  ok("A asigna Sofía al número de soporte", (await a.api(`/api/settings/numbers/${num2?.id}`, json("PATCH", { agentProfileId: sofia }))).status === 200);
  r = await bot(`/api/bot/profile?conversationId=${conv2}`);
  ok("el cerebro lee el perfil de Sofía para la conversación de soporte", r.json?.profile?.name === "Sofía Soporte", r.json?.profile);
  r = await bot(`/api/bot/profile?conversationId=${conv1}`);
  ok("…y el del principal para la otra", r.status === 200 && r.json?.profile?.name !== "Sofía Soporte", r.json?.profile);
  r = await bot(`/api/bot/profile?agentId=${agenteB}`);
  ok("la llave de A no lee un agente de B (404)", r.status === 404, r);

  console.log("\n== El despacho lleva al agente del número ==");
  const cerebro = await levantarCerebroFalso({ base: BASE, botKey: ENV_KEY });
  try {
    r = await encenderAgente(a.api);
    ok("A enciende la IA del negocio", r.res.ok, r.json);
    await inbound(PN2, CLIENTE, "¿abren el domingo?");
    const ev2 = await esperar(() => cerebro.de(conv2).at(-1), 20000);
    ok("el turno de soporte va con el agente Sofía", ev2?.evento?.agent?.id === sofia && ev2?.evento?.agent?.name === "Sofía Soporte", ev2?.evento?.agent);
    ok("…firmado", Boolean(ev2?.firmaOk));
    await inbound(PN1, CLIENTE, "¿y el sábado?");
    const ev1 = await esperar(() => cerebro.de(conv1).at(-1), 20000);
    ok("el turno del principal no lleva `agent` (contrato intacto)", ev1 && ev1.evento?.agent === undefined, ev1?.evento?.agent);

    ok("A apaga a Sofía", (await a.api(`/api/agents/${sofia}`, json("PATCH", { enabled: false }))).status === 200);
    const antes = cerebro.de(conv2).length;
    await inbound(PN2, CLIENTE, "¿hola?");
    await sleep(5000);
    ok("con Sofía apagada, soporte no se despacha", cerebro.de(conv2).length === antes, cerebro.de(conv2).length - antes);
    const antes1 = cerebro.de(conv1).length;
    await inbound(PN1, CLIENTE, "¿sigues ahí?");
    ok("…pero el principal sí", Boolean(await esperar(() => cerebro.de(conv1).length > antes1, 20000)));
  } finally {
    await apagarAgente(a.api);
    await cerebro.esperar();
    await cerebro.apagar();
  }

  console.log("\n== Quitar y cambiar el principal ==");
  ok("borrar a Sofía", (await a.api(`/api/agents/${sofia}`, json("DELETE"))).status === 200);
  r = await a.api("/api/settings/numbers");
  ok("su número vuelve al agente principal", r.json?.numeros?.find((n) => n.id === num2?.id)?.agentProfileId === null, r.json?.numeros);
  ok("hacer principal al de soporte", (await a.api(`/api/settings/numbers/${num2?.id}`, json("PATCH", { isPrimary: true }))).status === 200);
  r = await a.api("/api/settings/numbers");
  ok("solo hay un principal y es soporte", r.json?.numeros?.filter((n) => n.isPrimary).map((n) => n.phoneNumberId).join() === PN2, r.json?.numeros);
  ok("quitar el número de soporte", (await a.api(`/api/settings/numbers/${num2?.id}`, json("DELETE"))).status === 200);
  r = await a.api("/api/settings/numbers");
  ok("el que queda pasa a ser principal", r.json?.numeros?.length === 1 && r.json.numeros[0].isPrimary && r.json.numeros[0].phoneNumberId === PN1, r.json?.numeros);
  ok("la conversación de soporte se queda en la bandeja", ((await a.api("/api/conversations")).json?.conversations ?? []).some((c) => c.id === conv2));
  r = await a.api(`/api/conversations/${conv2}/messages`, json("POST", { text: "ya sin soporte" }));
  sale = await esperar(async () => (await outbox()).find((m) => JSON.stringify(m).includes("ya sin soporte")));
  ok("…y si se le contesta, sale por el principal", r.res.ok && sale?.phoneNumberId === PN1, sale);

  console.log("\n== Bitácora y webhook ==");
  ok("un evento a un número quitado no crea nada", (await inbound(PN2, "50255559999", "¿hay alguien?")).ok);
  await sleep(1000);
  const [{ n: huerfanas }] = await sql`select count(*)::int n from contact where wa_identity like '%5559999%'`;
  ok("…(no hay a qué negocio enrutarlo)", huerfanas === 0);

  console.log(`\n${checks - failures}/${checks} checks OK`);
  await sql.end();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end().catch(() => {});
  process.exit(1);
});
