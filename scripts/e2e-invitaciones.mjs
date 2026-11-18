/**
 * Self-test E2E de 068 · etapa 2 — registro de negocios por invitación.
 * Base limpia, app con SMTP_HOST=mock (buzón en /api/dev/mail-mock) y
 * SETUP_REVEAL_TOKEN (para leer la contraseña de Optimus una vez):
 *   node --env-file=.env.e2e-067 scripts/e2e-invitaciones.mjs
 */
import postgres from "postgres";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL, { max: 2 });
const RUN = Date.now().toString(36);
let OPT_PASS = "";

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
    let text = "";
    try {
      text = await res.clone().text();
    } catch {}
    return { res, json, text, status: res.status };
  };
  return {
    api,
    entrar: (username, password) => api("/api/auth/sign-in/username", { method: "POST", body: JSON.stringify({ username, password }) }),
  };
}
const post = (s, ruta, body) => s.api(ruta, { method: "POST", body: JSON.stringify(body ?? {}) });
const tokenDe = (url) => new URL(url).pathname.split("/")[2];
const correosPara = async (email) =>
  ((await fetch(`${BASE}/api/dev/mail-mock?para=${encodeURIComponent(email)}`).then((x) => x.json())).enviados ?? []);
const enlaceDe = (c) => /(https?:\/\/\S+)/.exec(c?.texto ?? "")?.[1] ?? null;

async function main() {
  console.log(`Self-test 068 · invitaciones contra ${BASE}`);
  await fetch(`${BASE}/api/dev/mail-mock`, { method: "DELETE" });

  // Arranque: la principal + Optimus.
  const dp = sesion();
  let r = await post(dp, "/api/auth/sign-up/email", { email: `principal-${RUN}@x.test`, password: "password-principal-1", name: "Principal" });
  r = await post(sesion(), "/api/setup/credenciales", { token: process.env.SETUP_REVEAL_TOKEN });
  ok("Optimus: contraseña inicial (base limpia)", r.status === 200, r.json);
  OPT_PASS = r.json?.password ?? "";
  const su = sesion();
  ok("Optimus entra", (await su.entrar("Optimus", OPT_PASS)).res.ok);

  console.log("\n== Solo el superadministrador invita ==");
  ok("anónimo → 404", (await post(sesion(), "/api/admin/invitaciones", {})).status === 404);
  ok("el dueño de un negocio → 404", (await post(dp, "/api/admin/invitaciones", {})).status === 404);
  r = await post(su, "/api/admin/invitaciones", { note: "Lupita" });
  ok("Optimus genera una invitación → 201 con enlace", r.status === 201 && /\/invitacion\//.test(r.json?.url ?? ""), r.json);
  const url = r.json?.url;
  const token = tokenDe(url);
  const invId = r.json?.id;
  ok("el token tiene 32 bytes aleatorios", token.length >= 43);
  const [fila] = await sql`select * from business_invitation where id = ${invId}`;
  ok("en la base solo está su hash", fila && fila.token_hash !== token && !JSON.stringify(fila).includes(token));
  const lista0 = (await su.api("/api/admin/invitaciones")).json?.invitaciones ?? [];
  const vence = new Date(lista0.find((i) => i.id === invId)?.expiresAt).getTime() - Date.now();
  ok("vence en ~7 días", vence > 6.9 * 864e5 && vence <= 7 * 864e5 + 6e4, vence);

  console.log("\n== Paso 1: negocio y correo ==");
  const anon = sesion();
  r = await anon.api(`/invitacion/${token}`);
  ok("la página de la invitación abre", r.status === 200 && r.text.includes("Registra tu negocio"));
  r = await anon.api(`/invitacion/inventado-${RUN}`);
  ok("un token inventado → «Invitación no válida»", r.text.includes("Invitación no válida"));
  ok("solicitar con token inventado → 410", (await post(anon, `/api/invitacion/inventado-${RUN}/solicitar`, { negocio: "Negocio X", email: "x@x.test" })).status === 410);
  r = await post(anon, `/api/invitacion/${token}/solicitar`, { negocio: "Panadería Lupita", email: `principal-${RUN}@x.test` });
  ok("un correo que ya tiene cuenta → 409", r.status === 409, r.json);
  ok("completar ANTES de verificar → 410", (await post(anon, `/api/invitacion/${token}/completar`, { codigo: "x", nombre: "L", username: "lupita", password: "password-1234" })).status === 410);
  const EMAIL = `lupita@lupita-${RUN}.test`;
  r = await post(anon, `/api/invitacion/${token}/solicitar`, { negocio: "Panadería Lupita", email: EMAIL.toUpperCase() });
  ok("solicitar → 200 y el correo salió", r.status === 200 && r.json?.enviado === true, r.json);
  const mails = await correosPara(EMAIL);
  ok("le llega UN correo de verificación (correo normalizado)", mails.length === 1 && /Confirma tu correo/.test(mails[0]?.asunto ?? ""), mails.length);
  const verif = enlaceDe(mails[0]);
  ok("el enlace apunta a /invitacion/{token}/verificar", verif?.includes(`/invitacion/${token}/verificar?c=`), verif);
  const codigo = new URL(verif).searchParams.get("c");
  const [f2] = await sql`select status, code_hash from business_invitation where id = ${invId}`;
  ok("estado «verificando», código solo como hash", f2?.status === "verificando" && f2?.code_hash !== codigo);

  console.log("\n== Paso 2: verificar el correo ==");
  r = await anon.api(`/invitacion/${token}/verificar?c=malo-${RUN}`);
  ok("un código equivocado no verifica", r.text.includes("Este enlace ya no sirve"));
  ok("…y la invitación sigue esperando", (await sql`select status from business_invitation where id = ${invId}`)[0].status === "verificando");
  r = await anon.api(`/invitacion/${token}/verificar?c=${codigo}`);
  ok("el código correcto verifica y muestra el último paso", r.status === 200 && r.text.includes("Correo confirmado"));
  ok("estado «verificada»", (await sql`select status from business_invitation where id = ${invId}`)[0].status === "verificada");

  console.log("\n== Paso 3: usuario y contraseña ==");
  const completar = (body) => post(sesion(), `/api/invitacion/${token}/completar`, { codigo, nombre: "Lupita", password: "password-lupita-1", ...body });
  ok("usuario inválido → 422", (await completar({ username: "no vale" })).status === 422);
  r = await completar({ username: "OPTIMUS" });
  ok("un usuario ya usado → 409", r.status === 409 && r.json?.error?.code === "usuario_ocupado", r.json);
  ok("…y la invitación vuelve a «verificada» (puede reintentar)", (await sql`select status from business_invitation where id = ${invId}`)[0].status === "verificada");
  ok("código equivocado → 410", (await completar({ codigo: "malo", username: `lupita_${RUN}` })).status === 410);
  // Carrera: dos envíos a la vez → un solo negocio.
  const [c1, c2] = await Promise.all([completar({ username: `lupita_${RUN}` }), completar({ username: `lupita2_${RUN}` })]);
  const exitos = [c1, c2].filter((x) => x.status === 201);
  ok("dos envíos simultáneos → exactamente un negocio", exitos.length === 1, [c1.status, c2.status]);
  const creado = exitos[0]?.json;
  ok("se crea con web ID sugerido del nombre", /^panaderia-lupita/.test(creado?.slug ?? ""), creado);
  const [org] = await sql`select id, slug, status from organization where id = ${creado?.organizationId}`;
  ok("el negocio existe y está activo", org?.status === "active");
  const [usr] = await sql`select u.username, u.email_verified, m.role from "user" u join member m on m.user_id = u.id where m.organization_id = ${org?.id}`;
  ok("su administrador es dueño, con usuario y correo verificado", usr?.role === "owner" && usr?.email_verified === true && usr?.username === creado?.username.toLowerCase(), usr);
  const [{ n: etapas }] = await sql`select count(*)::int n from pipeline_stage where organization_id = ${org?.id}`;
  ok("viene sembrado como cualquier negocio", etapas === 5);
  ok("estado «usada», con su negocio", (await sql`select status, organization_id from business_invitation where id = ${invId}`)[0].organization_id === org?.id);
  const dueno = sesion();
  ok("el nuevo dueño entra con su usuario", (await dueno.entrar(creado?.username, "password-lupita-1")).res.ok);
  r = await dueno.api("/api/conversations");
  ok("ve SU CRM, vacío (nada de otros negocios)", r.status === 200 && r.json?.conversations?.length === 0, r.json);
  ok("no ve /admin", (await dueno.api("/admin")).status === 404);

  console.log("\n== Un solo uso ==");
  ok("la página ya no sirve", (await anon.api(`/invitacion/${token}`)).text.includes("Invitación no válida"));
  ok("solicitar de nuevo → 410", (await post(anon, `/api/invitacion/${token}/solicitar`, { negocio: "Otra", email: `otra@${RUN}.test` })).status === 410);
  ok("completar de nuevo → 410", (await completar({ username: `otro_${RUN}` })).status === 410);
  ok("revocar una usada → 409", (await su.api(`/api/admin/invitaciones/${invId}`, { method: "DELETE" })).status === 409);

  console.log("\n== Vencida y revocada ==");
  r = await post(su, "/api/admin/invitaciones", { note: "vence" });
  const tVence = tokenDe(r.json?.url);
  await sql`update business_invitation set expires_at = now() - interval '1 minute' where id = ${r.json?.id}`;
  ok("una vencida no sirve", (await post(anon, `/api/invitacion/${tVence}/solicitar`, { negocio: "Negocio V", email: `v@${RUN}.test` })).status === 410);
  r = await post(su, "/api/admin/invitaciones", { note: "revocar" });
  const tRev = tokenDe(r.json?.url);
  ok("revocar → 200", (await su.api(`/api/admin/invitaciones/${r.json?.id}`, { method: "DELETE" })).status === 200);
  ok("una revocada no sirve", (await post(anon, `/api/invitacion/${tRev}/solicitar`, { negocio: "Negocio R", email: `r@${RUN}.test` })).status === 410);
  r = await su.api("/api/admin/invitaciones");
  const estados = (r.json?.invitaciones ?? []).map((i) => i.status).sort();
  ok("la lista muestra usada, vencida y revocada", ["revocada", "usada", "vencida"].every((e) => estados.includes(e)), estados);

  console.log("\n== Sin correo: enlace de verificación manual ==");
  r = await post(su, "/api/admin/invitaciones", { note: "manual" });
  const tMan = tokenDe(r.json?.url);
  const idMan = r.json?.id;
  ok("enlace manual antes de pedirlo → 409", (await post(su, `/api/admin/invitaciones/${idMan}/verificacion`)).status === 409);
  await post(anon, `/api/invitacion/${tMan}/solicitar`, { negocio: "Ferretería Manual", email: `manual@${RUN}.test` });
  r = await post(su, `/api/admin/invitaciones/${idMan}/verificacion`);
  ok("Optimus genera el enlace de verificación", r.status === 200 && /\/verificar\?c=/.test(r.json?.url ?? ""), r.json);
  ok("…que rota el enlace de invitación viejo", (await anon.api(`/invitacion/${tMan}`)).text.includes("Invitación no válida"));
  const vMan = new URL(r.json?.url);
  const tMan2 = vMan.pathname.split("/")[2];
  r = await anon.api(`${vMan.pathname}${vMan.search}`);
  ok("el enlace manual verifica", r.text.includes("Correo confirmado"));
  r = await post(sesion(), `/api/invitacion/${tMan2}/completar`, { codigo: vMan.searchParams.get("c"), nombre: "Don Manual", username: `manual_${RUN}`, password: "password-manual-1" });
  ok("…y se completa el registro", r.status === 201, r.json);

  console.log("\n== Bitácora ==");
  const acciones = (await sql`select action from audit_log`).map((a) => a.action);
  for (const a of ["admin POST /invitaciones", "invitacion.solicitada", "invitacion.verificada", "invitacion.usada"]) {
    ok(`registra ${a}`, acciones.includes(a));
  }
  ok("la bitácora no guarda tokens ni códigos", !JSON.stringify(await sql`select * from audit_log`).includes(token) && !JSON.stringify(await sql`select * from audit_log`).includes(codigo));

  await navegador();
  console.log(`\n${checks - failures}/${checks} checks OK`);
  await sql.end();
  process.exit(failures ? 1 : 0);
}

async function navegador() {
  console.log("\n== Navegador: Optimus invita, el cliente se registra ==");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    // Optimus: entra y genera el enlace desde /admin.
    const page = await (await browser.newContext({ baseURL: BASE })).newPage();
    await page.goto("/login");
    await page.fill("#username", "optimus");
    await page.fill("#password", OPT_PASS);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => u.pathname === "/admin", { timeout: 20000 });
    await page.getByRole("button", { name: "Invitar negocio" }).click();
    await page.fill("#inv-nota", "Cliente UI");
    await page.getByRole("button", { name: "Generar enlace" }).click();
    const enlace = (await page.getByTestId("enlace-invitacion").textContent({ timeout: 10000 }))?.trim();
    ok("UI: Optimus genera y ve el enlace una vez", Boolean(enlace?.includes("/invitacion/")));
    await page.screenshot({ path: ".tmp-e2e-invitacion-admin.png", fullPage: true });

    // El cliente, en otro navegador.
    const cli = await (await browser.newContext({ baseURL: BASE })).newPage();
    await cli.goto(enlace);
    await cli.fill("#inv-negocio", "Café de la Esquina");
    const email = `cafe@ui-${RUN}.test`;
    await cli.fill("#inv-email", email);
    await cli.getByRole("button", { name: "Verificar mi correo" }).click();
    ok("UI: «Revisa tu correo»", await cli.getByText("Revisa tu correo").waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
    const verif = enlaceDe((await correosPara(email))[0]);
    await cli.goto(verif);
    await cli.fill("#inv-nombre", "Carmen");
    await cli.fill("#inv-usuario", `Carmen_${RUN}`.slice(0, 30));
    await cli.fill("#inv-pass", "password-carmen-1");
    await cli.fill("#inv-pass2", "password-carmen-1");
    await cli.screenshot({ path: ".tmp-e2e-invitacion-cliente.png", fullPage: true });
    await cli.getByRole("button", { name: "Crear mi negocio" }).click();
    await cli.waitForURL((u) => !u.pathname.startsWith("/invitacion"), { timeout: 30000 });
    ok("UI: el cliente queda dentro de SU CRM", !cli.url().includes("/login") && !cli.url().includes("/invitacion"), cli.url());
    const [org] = await sql`select o.name from organization o join member m on m.organization_id = o.id join "user" u on u.id = m.user_id where u.email = ${email}`;
    ok("UI: el negocio «Café de la Esquina» existe", org?.name === "Café de la Esquina");
  } catch (err) {
    ok("navegador sin errores", false, String(err).slice(0, 300));
  } finally {
    await browser.close();
  }
}

main().catch(async (err) => {
  console.error(err);
  await sql.end().catch(() => {});
  process.exit(1);
});
