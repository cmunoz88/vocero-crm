/**
 * Self-test E2E de 067 — multi-tenant con superusuario. Conduce la app real
 * (API + navegador) con varias sesiones a la vez: el superusuario, el dueño
 * de cada tenant y dos cerebros falsos, cada uno con su llave.
 *
 * Uso:
 *   1) Postgres limpio + migraciones; app corriendo con el mismo entorno:
 *        APP_BASE_URL, DATABASE_URL, WA_MOCK_ENABLED=true, META_GRAPH_BASE_URL
 *        → wa-mock, OPENROUTER_* → ai-mock, AGENT_COALESCE_MS=1500,
 *        BOT_API_KEY (16+), BRAIN_DISPATCH_URL=http://127.0.0.1:3261/vocero/dispatch,
 *        SUPERADMIN_EMAILS=super@principal.test, MEDIA_DIR
 *   2) node --env-file=.env.e2e-067 scripts/e2e-multi-tenant.mjs
 *
 * Cubre los criterios CA-1…CA-8 de specs/067-multi-tenant/spec.md. Sale con
 * código 1 si algún check falla.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { encenderAgente, levantarCerebroFalso } from "./lib/cerebro-falso.mjs";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const ENV_KEY = process.env.BOT_API_KEY;
const SUPER = { email: "super@principal.test", password: "password-super-123", name: "Super Admin" };
const sql = postgres(process.env.DATABASE_URL, { max: 2 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN = Date.now().toString(36);

let checks = 0;
let failures = 0;
function ok(name, cond, extra = "") {
  checks++;
  if (cond) console.log(`  OK  ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra)}` : ""}`);
  }
}

/** Una sesión con su propio frasco de cookies. */
function sesion() {
  let cookie = "";
  const api = async (ruta, opts = {}) => {
    const res = await fetch(`${BASE}${ruta}`, {
      redirect: "manual",
      ...opts,
      headers: {
        "content-type": "application/json",
        origin: BASE,
        ...(cookie ? { cookie } : {}),
        ...(opts.headers ?? {}),
      },
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    let json = null;
    try {
      json = await res.clone().json();
    } catch {}
    return { res, json, status: res.status };
  };
  return {
    api,
    get cookie() {
      return cookie;
    },
    entrar: (email, password) =>
      api("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) }),
  };
}

const bot = (llave, ruta, opts = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opts,
    headers: { "content-type": "application/json", "x-api-key": llave, ...(opts.headers ?? {}) },
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));

const inbound = (anon, pn, from, text) =>
  anon.api("/api/dev/wa-mock/inbound", {
    method: "POST",
    body: JSON.stringify({
      phoneNumberId: pn,
      from,
      name: `Cliente ${from.slice(-4)}`,
      text,
      waMessageId: `wamid.067.${RUN}.${Math.random().toString(36).slice(2)}`,
    }),
  });

async function esperar(cond, ms = 15000, paso = 500) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await cond();
    if (v || Date.now() > fin) return v;
    await sleep(paso);
  }
}

async function main() {
  console.log(`Self-test 067 contra ${BASE}`);
  const health = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!health?.ok) {
    console.error("La app no responde en /api/health");
    process.exit(1);
  }

  // ---------------------------------------------------------------------
  console.log("\n== Arranque: la organización principal y su superusuario ==");
  const su = sesion();
  let r = await su.api("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify(SUPER) });
  if (!r.res.ok) r = await su.entrar(SUPER.email, SUPER.password);
  ok("el superusuario entra (primer registro = organización principal)", r.res.ok, r.json);
  const [principal] = await sql`select id, slug from organization order by created_at, id limit 1`;
  ok("la principal existe y está activa", Boolean(principal));

  // CA-1 ---------------------------------------------------------------
  console.log("\n== CA-1: /admin solo para el superusuario ==");
  const anon = sesion();
  ok("anónimo: GET /api/admin/tenants → 404", (await anon.api("/api/admin/tenants")).status === 404);
  ok("anónimo: /admin → 404", (await anon.api("/admin")).status === 404);
  r = await su.api("/api/admin/tenants");
  ok("superusuario: lista de negocios", r.status === 200 && Array.isArray(r.json?.tenants), r.json);
  ok(
    "la principal aparece marcada como principal",
    r.json?.tenants?.some((t) => t.id === principal.id && t.isPrimary)
  );
  ok("superusuario: /admin → 200", (await su.api("/admin")).status === 200);
  ok(
    "el registro público sigue cerrado",
    (await sesion().api("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email: `x${RUN}@x.test`, password: "password-123", name: "X" }),
    })).status >= 400
  );

  // CA-3 ---------------------------------------------------------------
  console.log("\n== CA-3: validación del web ID ==");
  const alta = (slug, email, name = "Negocio") =>
    su.api("/api/admin/tenants", {
      method: "POST",
      body: JSON.stringify({ name, slug, owner: { name: `Dueño ${slug}`, email, password: "password-dueno-1" } }),
    });
  r = await alta("A B", `bad${RUN}@t.test`);
  ok("web ID con espacio → 422", r.status === 422, r.json);
  r = await alta("admin", `bad${RUN}@t.test`);
  ok("web ID reservado → 422", r.status === 422 && r.json?.error?.code === "reservado", r.json);

  // CA-2 ---------------------------------------------------------------
  console.log("\n== CA-2: alta de negocios con su dueño ==");
  const A = { slug: `acme-${RUN}`, email: `dueno@acme-${RUN}.test`, name: "Acme Dental" };
  const B = { slug: `beta-${RUN}`, email: `dueno@beta-${RUN}.test`, name: "Beta Café" };
  r = await alta(A.slug, A.email, A.name);
  ok("alta de A → 201", r.status === 201, r.json);
  A.id = r.json?.organizationId;
  r = await alta(B.slug, B.email, B.name);
  ok("alta de B → 201", r.status === 201, r.json);
  B.id = r.json?.organizationId;
  ok("web ID repetido → 409", (await alta(A.slug, `otro${RUN}@t.test`)).status === 409);
  ok("correo repetido → 409", (await alta(`gamma-${RUN}`, A.email)).status === 409);
  ok(
    "un alta fallida por correo no deja negocio huérfano",
    (await sql`select count(*)::int n from organization where slug = ${`gamma-${RUN}`}`)[0].n === 0
  );
  const [etapas] = await sql`select count(*)::int n from pipeline_stage where organization_id = ${A.id}`;
  const [perfil] = await sql`select count(*)::int n from agent_profile where organization_id = ${A.id}`;
  ok("A viene sembrado (pipeline + perfil del agente)", etapas.n === 5 && perfil.n === 1, { etapas, perfil });

  const a = sesion();
  ok("el dueño de A entra", (await a.entrar(A.email, "password-dueno-1")).res.ok);
  const b = sesion();
  ok("el dueño de B entra", (await b.entrar(B.email, "password-dueno-1")).res.ok);
  ok("el dueño de A NO ve /api/admin (404)", (await a.api("/api/admin/tenants")).status === 404);
  ok("el dueño de A NO ve /admin (404)", (await a.api("/admin")).status === 404);

  // CA-4 ---------------------------------------------------------------
  console.log("\n== CA-4: entrada por web ID ==");
  r = await anon.api(`/t/${A.slug}/login`);
  const html = await r.res.text();
  ok("/t/{slug}/login → 200 con el nombre del negocio", r.status === 200 && html.includes(A.name));
  ok("/t/{inexistente}/login → 404", (await anon.api(`/t/no-existe-${RUN}/login`)).status === 404);
  r = await anon.api(`/t/${A.slug}`);
  ok("/t/{slug} sin sesión → a su login", [307, 308].includes(r.status) && r.res.headers.get("location")?.includes(`/t/${A.slug}/login`));
  ok("membresía: A pertenece a su web ID", (await a.api(`/api/tenant/${A.slug}/membership`)).json?.member === true);
  ok("membresía: A NO pertenece al de B", (await a.api(`/api/tenant/${B.slug}/membership`)).json?.member === false);

  // Aislamiento de datos -------------------------------------------------
  console.log("\n== Aislamiento: cada negocio con su número y sus conversaciones ==");
  const PNA = `PN-A-${RUN}`;
  const PNB = `PN-B-${RUN}`;
  r = await a.api("/api/settings/whatsapp", {
    method: "PUT",
    body: JSON.stringify({ wabaId: `WABA-A-${RUN}`, phoneNumberId: PNA, token: "tok-a" }),
  });
  ok("A conecta su WhatsApp", r.res.ok, r.json);
  r = await b.api("/api/settings/whatsapp", {
    method: "PUT",
    body: JSON.stringify({ wabaId: `WABA-B-${RUN}`, phoneNumberId: PNB, token: "tok-b" }),
  });
  ok("B conecta su WhatsApp", r.res.ok, r.json);
  await inbound(anon, PNA, "50255550001", "hola acme");
  await inbound(anon, PNB, "50255550002", "hola beta");
  const convsA = await esperar(async () => {
    const c = (await a.api("/api/conversations")).json?.conversations ?? [];
    return c.length ? c : null;
  });
  // Las dos ingestas corren en paralelo (y en frío compilan): se espera a cada una.
  const convsB =
    (await esperar(async () => {
      const c = (await b.api("/api/conversations")).json?.conversations ?? [];
      return c.length ? c : null;
    })) ?? [];
  ok("A ve solo su conversación", convsA?.length === 1 && convsA[0].contact.name === "Cliente 0001", convsA);
  ok("B ve solo la suya", convsB.length === 1 && convsB[0].contact.name === "Cliente 0002", convsB);
  ok(
    "A no puede abrir la conversación de B (404)",
    (await a.api(`/api/conversations/${convsB[0]?.id}/messages`)).status === 404
  );

  // CA-7 ---------------------------------------------------------------
  console.log("\n== CA-7: cerebro por tenant ==");
  r = await su.api(`/api/admin/tenants/${A.id}/brain`, {
    method: "PUT",
    body: JSON.stringify({ dispatchUrl: "ftp://mal" }),
  });
  ok("URL de despacho inválida → 422", r.status === 422, r.json);
  r = await su.api(`/api/admin/tenants/${A.id}/brain`, {
    method: "PUT",
    body: JSON.stringify({ dispatchUrl: "http://127.0.0.1:3262/vocero/dispatch", healthUrl: "" }),
  });
  ok("se guarda la URL del cerebro de A", r.status === 200 && r.json?.brain?.dispatchUrl?.includes("3262"), r.json);
  ok("sin llave todavía: inactivo por sin_llave", r.json?.brain?.config?.problem === "sin_llave", r.json);
  r = await su.api(`/api/admin/tenants/${A.id}/brain/key`, { method: "POST" });
  const KA = r.json?.key;
  ok("se genera la llave de A (se ve una vez)", typeof KA === "string" && KA.length >= 32, r.json);
  ok("la llave queda cifrada (no en claro en la base)", !(await sql`select key_cipher from brain_connection where organization_id = ${A.id}`)[0]?.key_cipher?.includes(KA));
  r = await su.api(`/api/admin/tenants/${A.id}`);
  ok("el detalle solo muestra los últimos 4", r.json?.brain?.keyLast4 === KA?.slice(-4) && !JSON.stringify(r.json).includes(KA));
  ok("el cerebro de A queda activo", r.json?.brain?.config?.active === true, r.json?.brain);

  const cerebroA = await levantarCerebroFalso({
    base: BASE,
    botKey: KA,
    url: new URL("http://127.0.0.1:3262/vocero/dispatch"),
  });
  const cerebroP = await levantarCerebroFalso({ base: BASE, botKey: ENV_KEY });
  try {
    r = await encenderAgente(a.api);
    ok("A enciende su Agente (su /health contesta)", r.res.ok, r.json);
    r = await b.api("/api/agent/profile", { method: "PUT", body: JSON.stringify({ enabled: true }) });
    ok("B no puede encender el suyo: sin cerebro → 409", r.status === 409, r.json);

    await inbound(anon, PNA, "50255550001", "¿tienen citas mañana?");
    const despacho = await esperar(() => cerebroA.estado.recibidos.find((x) => x.evento?.organization?.id === A.id), 20000);
    ok("el cerebro de A recibe el despacho firmado con SU llave", Boolean(despacho?.firmaOk), cerebroA.estado.recibidos.map((x) => x.firmaOk));
    ok("el cerebro principal NO recibe nada de A", cerebroP.estado.recibidos.length === 0, cerebroP.estado.recibidos.length);
    const respondio = await esperar(async () => {
      const ms = (await a.api(`/api/conversations/${convsA[0].id}/messages`)).json?.messages ?? [];
      return ms.some((m) => m.direction === "out" && /Respuesta de prueba/.test(m.text ?? "")) ? ms : null;
    }, 20000);
    ok("la respuesta del cerebro de A llega a la conversación de A", Boolean(respondio));

    r = await bot(KA, `/api/bot/context?conversationId=${convsB[0].id}`);
    ok("la llave de A no ve conversaciones de B (404)", r.status === 404, r);
    r = await bot(KA, "/api/bot/profile");
    ok("con la llave de A, /api/bot/profile es el de A", r.status === 200, r);

    // CA-8: el entorno sigue valiendo para la principal.
    r = await bot(ENV_KEY, "/api/bot/profile");
    ok("CA-8: BOT_API_KEY del entorno sigue autenticando a la principal", r.status === 200, r);
    r = await bot(ENV_KEY, `/api/bot/context?conversationId=${convsA[0].id}`);
    ok("CA-8: …y no ve conversaciones de A (404)", r.status === 404, r);
    r = await su.api(`/api/admin/tenants/${principal.id}`);
    ok("CA-8: la principal usa el entorno", r.json?.brain?.usaEntorno === true && r.json?.brain?.config?.active === true, r.json?.brain);
    ok("una llave inventada → 401", (await bot("vk_inventada-pero-suficientemente-larga", "/api/bot/profile")).status === 401);

    // CA-5 -------------------------------------------------------------
    console.log("\n== CA-5: suspender ==");
    r = await su.api(`/api/admin/tenants/${A.id}`, { method: "PATCH", body: JSON.stringify({ status: "suspended" }) });
    ok("se suspende A", r.status === 200, r.json);
    ok("el dueño de A ya no usa la API (401)", (await a.api("/api/conversations")).status === 401);
    r = await a.api("/inbox");
    ok(
      "el dueño de A, al abrir la app, va al login con el aviso",
      [307, 308].includes(r.status) && (r.res.headers.get("location") ?? "").includes("motivo=suspendido"),
      r.res.headers.get("location")
    );
    ok("la llave de A ya no autentica (401)", (await bot(KA, "/api/bot/profile")).status === 401);
    const antes = (await sql`select count(*)::int n from message where organization_id = ${A.id}`)[0].n;
    const recibidosAntes = cerebroA.estado.recibidos.length;
    r = await inbound(anon, PNA, "50255550001", "¿siguen ahí?");
    ok("Meta recibe su 200 aunque el negocio esté suspendido", r.res.ok, r.json);
    await sleep(4000);
    const despues = (await sql`select count(*)::int n from message where organization_id = ${A.id}`)[0].n;
    ok("el mensaje al número de A suspendido NO se ingiere", despues === antes, { antes, despues });
    ok("y no se despacha al cerebro de A", cerebroA.estado.recibidos.length === recibidosAntes);
    r = await anon.api(`/t/${A.slug}/login`);
    ok("su login dice que está suspendido", (await r.res.text()).includes("suspendido"));
    ok("B sigue operando", (await b.api("/api/conversations")).status === 200);

    r = await su.api(`/api/admin/tenants/${A.id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
    ok("se reactiva A", r.status === 200);
    ok("el dueño de A vuelve a operar", (await a.api("/api/conversations")).status === 200);
    ok("su llave vuelve a autenticar", (await bot(KA, "/api/bot/profile")).status === 200);

    // Rotar llave: la vieja deja de servir.
    r = await su.api(`/api/admin/tenants/${A.id}/brain/key`, { method: "POST" });
    ok("rotar llave → la anterior deja de autenticar", r.json?.key !== KA && (await bot(KA, "/api/bot/profile")).status === 401);
    ok("…y la nueva sí", (await bot(r.json?.key, "/api/bot/profile")).status === 200);
  } finally {
    await a.api("/api/agent/profile", { method: "PUT", body: JSON.stringify({ enabled: false }) }).catch(() => {});
    await cerebroA.esperar();
    await cerebroA.apagar();
    await cerebroP.apagar();
  }

  // CA-6 ---------------------------------------------------------------
  console.log("\n== CA-6: borrado definitivo ==");
  const mediaDir = path.resolve(process.env.MEDIA_DIR ?? "./.dev-media", A.id);
  mkdirSync(mediaDir, { recursive: true });
  writeFileSync(path.join(mediaDir, "marca.txt"), "x");
  const del = (id, confirm) => su.api(`/api/admin/tenants/${id}`, { method: "DELETE", body: JSON.stringify({ confirm }) });
  ok("activo → 409 (primero suspender)", (await del(A.id, A.slug)).status === 409);
  await su.api(`/api/admin/tenants/${A.id}`, { method: "PATCH", body: JSON.stringify({ status: "suspended" }) });
  ok("confirmación equivocada → 422", (await del(A.id, "otra-cosa")).status === 422);
  r = await del(A.id, A.slug);
  ok("borrado con el web ID → 200", r.status === 200, r.json);
  ok("se borró la cuenta del dueño", r.json?.usuariosBorrados === 1, r.json);
  const quedan = await sql`
    select (select count(*) from organization where id = ${A.id})
         + (select count(*) from member where organization_id = ${A.id})
         + (select count(*) from contact where organization_id = ${A.id})
         + (select count(*) from conversation where organization_id = ${A.id})
         + (select count(*) from message where organization_id = ${A.id})
         + (select count(*) from meta_credentials where organization_id = ${A.id})
         + (select count(*) from brain_connection where organization_id = ${A.id})
         + (select count(*) from dispatch where organization_id = ${A.id})
         + (select count(*) from pipeline_stage where organization_id = ${A.id}) as n`;
  ok("no queda ninguna fila de A", Number(quedan[0].n) === 0, quedan[0]);
  ok("no queda el usuario de A", (await sql`select count(*)::int n from "user" where email = ${A.email}`)[0].n === 0);
  ok("se borró MEDIA_DIR/{orgId}", !existsSync(mediaDir));
  ok("el dueño de A ya no entra", !(await sesion().entrar(A.email, "password-dueno-1")).res.ok);
  ok("B intacto", (await b.api("/api/conversations")).json?.conversations?.length === 1);
  ok("/t/{slug de A} → 404", (await anon.api(`/t/${A.slug}/login`)).status === 404);

  // El superusuario no se puede borrar a sí mismo.
  await su.api(`/api/admin/tenants/${principal.id}`, { method: "PATCH", body: JSON.stringify({ status: "suspended" }) });
  r = await del(principal.id, principal.slug ?? principal.id);
  ok("no se puede borrar el negocio propio → 409", r.status === 409 && r.json?.error?.code === "propio", r.json);
  ok("con la principal suspendida, /admin sigue abierto para el superusuario", (await su.api("/api/admin/tenants")).status === 200);
  await su.api(`/api/admin/tenants/${principal.id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });

  // Navegador ------------------------------------------------------------
  await navegador(B);

  console.log(`\n${checks - failures}/${checks} checks OK`);
  await sql.end();
  process.exit(failures ? 1 : 0);
}

/** El flujo visible: el superusuario crea un negocio desde /admin, y el login por web ID. */
async function navegador(B) {
  console.log("\n== Navegador: /admin y /t/{slug}/login ==");
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    ok("playwright disponible", false, "instala los navegadores: pnpm exec playwright install chromium");
    return;
  }
  const browser = await chromium.launch();
  const shots = path.resolve(".tmp-e2e-067");
  mkdirSync(shots, { recursive: true });
  try {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.fill("#email", SUPER.email);
    await page.fill("#password", SUPER.password);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    await page.goto("/inbox");
    ok("el menú del superusuario trae «Negocios»", await page.getByRole("link", { name: "Negocios" }).first().isVisible());
    await page.goto("/admin");
    await page.getByRole("button", { name: "Nuevo negocio" }).click();
    const slug = `ui-${RUN}`;
    await page.fill("#t-name", "Ferretería Ñandú");
    ok("el web ID se sugiere del nombre", (await page.inputValue("#t-slug")) === "ferreteria-nandu");
    await page.fill("#t-slug", slug);
    await page.fill("#o-name", "Dueña UI");
    await page.fill("#o-email", `duena@${slug}.test`);
    await page.getByRole("button", { name: "Generar" }).click();
    const pass = await page.inputValue("#o-pass");
    await page.getByRole("button", { name: "Crear negocio" }).click();
    await page.getByText("Negocio creado ✓").waitFor({ timeout: 15000 });
    ok("alta desde la UI: muestra la entrada y la contraseña una vez", await page.getByText(`/t/${slug}`).first().isVisible());
    await page.screenshot({ path: path.join(shots, "admin-alta.png"), fullPage: true });
    await page.getByRole("button", { name: "Cerrar" }).click();
    await page.getByRole("link", { name: /Ferretería Ñandú/ }).click();
    await page.getByRole("heading", { name: "Ferretería Ñandú" }).waitFor();
    await page.getByRole("button", { name: "Generar llave" }).click();
    ok("generar llave desde la UI la muestra una vez", await page.getByText("Copia la llave ahora").isVisible({ timeout: 10000 }).catch(() => false) || (await page.getByText("Copia la llave ahora").waitFor({ timeout: 10000 }).then(() => true).catch(() => false)));
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Suspender negocio" }).click();
    await page.getByRole("button", { name: "Reactivar negocio" }).waitFor({ timeout: 10000 });
    ok("suspender desde la UI", true);
    await page.screenshot({ path: path.join(shots, "admin-detalle.png"), fullPage: true });
    await page.getByLabel("Confirmar web ID").fill(slug);
    await page.getByRole("button", { name: "Borrar para siempre" }).click();
    await page.waitForURL((u) => u.pathname === "/admin", { timeout: 15000 });
    await page.waitForTimeout(800);
    ok("borrar desde la UI vuelve a la lista sin el negocio", !(await page.getByText("Ferretería Ñandú").isVisible().catch(() => false)));
    void pass;

    // Login por web ID con una cuenta de OTRO negocio.
    const ctx2 = await browser.newContext({ baseURL: BASE });
    const p2 = await ctx2.newPage();
    await p2.goto(`/t/${B.slug}/login`);
    ok("el login del negocio muestra su nombre", await p2.getByRole("heading", { name: B.name }).isVisible());
    await p2.fill("#email", SUPER.email);
    await p2.fill("#password", SUPER.password);
    await p2.click("button[type=submit]");
    // Next agrega su propio role=alert (el anunciador de rutas): se busca el texto.
    const aviso = p2.getByText(`Esta cuenta no pertenece a ${B.name}.`);
    ok("una cuenta de otro negocio no entra, y se dice", await aviso.waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
    ok("…y la sesión de esa cuenta se cerró", !p2.url().includes("/inbox"));
    await p2.fill("#email", B.email);
    await p2.fill("#password", "password-dueno-1");
    await p2.click("button[type=submit]");
    await p2.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
    ok("el dueño de B entra por su web ID", !p2.url().includes("/login"));
    await p2.screenshot({ path: path.join(shots, "tenant-dentro.png") });
  } catch (err) {
    ok("flujo de navegador sin errores", false, String(err).slice(0, 400));
  } finally {
    await browser.close();
  }
}

main().catch(async (err) => {
  console.error(err);
  await sql.end().catch(() => {});
  process.exit(1);
});
