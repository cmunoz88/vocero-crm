/**
 * Self-test E2E de 068 · etapa 1 — acceso a la plataforma: Optimus, login por
 * usuario, recuperación por correo (buzón mock), verificación del correo,
 * usuarios en /admin, bitácora y que ningún secreto quede en claro.
 *
 * Uso (base limpia, app con el mismo entorno que e2e-multi-tenant, que trae
 * SUPERADMIN_RECOVERY_EMAIL, SETUP_REVEAL_TOKEN y SMTP_HOST=mock):
 *   node --env-file=.env.e2e-067 scripts/e2e-acceso.mjs [ruta/al/dev.log]
 * Si se pasa el log del servidor, se revisa que ninguna contraseña aparezca.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const TOKEN = process.env.SETUP_REVEAL_TOKEN ?? "";
const LOG = process.argv[2];
const sql = postgres(process.env.DATABASE_URL, { max: 2 });
const RUN = Date.now().toString(36);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secretos = [];

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

// Cada sesión con su propia IP: el límite por IP (10 intentos de login en
// 10 min) es real y el arnés hace muchos más desde la misma máquina.
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
  return {
    api,
    entrar: (username, password) =>
      api("/api/auth/sign-in/username", { method: "POST", body: JSON.stringify({ username, password }) }),
  };
}
const puedeEntrar = async (u, p) => (await sesion().entrar(u, p)).res.ok;
const post = (s, ruta, body) => s.api(ruta, { method: "POST", body: JSON.stringify(body ?? {}) });

async function correosPara(email) {
  const r = await fetch(`${BASE}/api/dev/mail-mock?para=${encodeURIComponent(email)}`).then((x) => x.json());
  return r.enviados ?? [];
}
const enlaceDe = (correo) => /(https?:\/\/\S+)/.exec(correo?.texto ?? "")?.[1] ?? null;

async function main() {
  console.log(`Self-test 068 · acceso contra ${BASE}`);
  await fetch(`${BASE}/api/dev/mail-mock`, { method: "DELETE" });

  // ---------------------------------------------------------------- Optimus
  console.log("\n== Optimus: creado al arrancar, contraseña vista UNA vez ==");
  const [su0] = await sql`select id, username, display_username, email, email_verified, platform_role from "user" where platform_role = 'superadmin'`;
  ok("existe un único superadministrador «Optimus»", su0?.display_username === "Optimus" && su0?.username === "optimus", su0);
  ok("su correo de recuperación es el del entorno y está verificado", su0?.email === process.env.SUPERADMIN_RECOVERY_EMAIL && su0?.email_verified === true);
  const [{ n: nSupers }] = await sql`select count(*)::int n from "user" where platform_role = 'superadmin'`;
  ok("solo hay uno", nSupers === 1);
  const [{ n: nOrgsOptimus }] = await sql`select count(*)::int n from member where user_id = ${su0?.id}`;
  ok("Optimus no pertenece a ningún negocio", nOrgsOptimus === 0);

  ok("llave equivocada → 403", (await post(sesion(), "/api/setup/credenciales", { token: "x".repeat(40) })).status === 403);
  let r = await post(sesion(), "/api/setup/credenciales", { token: TOKEN });
  let OPT = r.json?.password;
  if (r.status === 410) {
    // Ya la leyó otro E2E en esta base (multi-tenant): se rota para seguir.
    ok("(la contraseña ya se había leído: 410)", true);
    OPT = null;
  } else {
    ok("con la llave correcta se ve usuario y contraseña", r.status === 200 && r.json?.username === "Optimus" && OPT?.length === 20, r.json);
    ok("no se guarda en caché", r.res.headers.get("cache-control") === "no-store");
  }
  if (OPT) secretos.push(OPT);
  ok("la segunda vez ya no hay nada (410)", (await post(sesion(), "/api/setup/credenciales", { token: TOKEN })).status === 410);
  ok("el secreto cifrado se borró de la base", (await sql`select count(*)::int n from one_time_secret`)[0].n === 0);
  const [cuenta] = await sql`select password from account where user_id = ${su0?.id} and provider_id = 'credential'`;
  ok("la contraseña está como hash (no en claro)", Boolean(cuenta?.password) && cuenta.password !== OPT && cuenta.password.includes(":"));

  if (!OPT) {
    console.log("  (sin la contraseña de Optimus no se puede seguir: corre este E2E sobre una base limpia)");
    return fin();
  }

  // ------------------------------------------------------------ login
  console.log("\n== Login por usuario ==");
  const su = sesion();
  ok("«OPTIMUS» entra (sin distinguir mayúsculas)", (await su.entrar("OPTIMUS", OPT)).res.ok);
  ok("contraseña equivocada no entra", !(await puedeEntrar("optimus", "equivocada-123")));
  ok("usuario inexistente no entra", !(await puedeEntrar(`nadie_${RUN}`, OPT)));
  ok("/admin abre para Optimus", (await su.api("/admin")).status === 200);
  ok("/admin/usuarios abre para Optimus", (await su.api("/admin/usuarios")).status === 200);
  for (const ruta of ["/api/auth/request-password-reset", "/api/auth/send-verification-email", "/api/auth/is-username-available"]) {
    r = await post(sesion(), ruta, { email: process.env.SUPERADMIN_RECOVERY_EMAIL, username: "optimus" });
    ok(`${ruta} no se expone por HTTP (404)`, r.status === 404, r.status);
  }

  // ------------------------------------------------- negocio y su dueño
  console.log("\n== Alta con usuario; usuarios únicos ==");
  // La principal (si no existe) para que el alta no sea la primera organización.
  await post(sesion(), "/api/auth/sign-up/email", { email: `principal-${RUN}@x.test`, password: "password-principal-1", name: "Principal" });
  const slug = `acceso-${RUN}`;
  const dueno = { username: `Lupita_${RUN}`.slice(0, 30), email: `lupita@${slug}.test`, password: "password-lupita-1" };
  r = await post(su, "/api/admin/tenants", { name: "Panadería Lupita", slug, owner: { name: "Lupita", ...dueno } });
  ok("alta del negocio con el usuario del dueño → 201", r.status === 201, r.json);
  const orgId = r.json?.organizationId;
  r = await post(su, "/api/admin/tenants", {
    name: "Otro",
    slug: `otro-${RUN}`,
    owner: { name: "X", email: `x@otro-${RUN}.test`, username: dueno.username.toUpperCase(), password: "password-xxxx-1" },
  });
  ok("el mismo usuario con otras mayúsculas → 409", r.status === 409 && r.json?.error?.code === "usuario_ocupado", r.json);
  ok("el dueño entra con su usuario", await puedeEntrar(dueno.username.toLowerCase(), dueno.password));
  const d = sesion();
  await d.entrar(dueno.username, dueno.password);
  ok("el dueño NO ve /admin (404)", (await d.api("/admin")).status === 404);
  ok("el dueño NO ve /api/admin/users (404)", (await d.api("/api/admin/users")).status === 404);

  r = await post(d, "/api/settings/team", { name: "Cajero", email: `cajero@${slug}.test`, username: `cajero_${RUN}`, password: "password-cajero-1" });
  ok("el dueño crea una cuenta de equipo con usuario", r.status === 201, r.json);
  ok("el cajero entra con su usuario", await puedeEntrar(`cajero_${RUN}`, "password-cajero-1"));
  r = await post(d, "/api/auth/update-user", { username: "optimus" });
  ok("no se puede tomar el usuario de otro (optimus)", !r.res.ok, r.status);
  r = await post(d, "/api/auth/update-user", { platformRole: "superadmin" });
  const [rol] = await sql`select platform_role from "user" where email = ${dueno.email}`;
  ok("nadie se vuelve superadministrador por la API", rol?.platform_role === null, rol);

  // ---------------------------------------------------- recuperación
  console.log("\n== Recuperación por correo ==");
  r = await post(sesion(), "/api/cuenta/olvide", { username: dueno.username });
  const uniforme = r.json?.message;
  ok("olvidé (correo sin verificar) → respuesta uniforme 200", r.status === 200 && Boolean(uniforme));
  ok("…y no se manda nada (el correo no está verificado)", (await correosPara(dueno.email)).length === 0);
  r = await post(sesion(), "/api/cuenta/olvide", { username: `nadie_${RUN}` });
  ok("usuario inexistente → la MISMA respuesta", r.status === 200 && r.json?.message === uniforme);

  r = await post(d, "/api/cuenta/verificar-correo");
  ok("el dueño pide verificar su correo", r.status === 200, r.json);
  let mails = await correosPara(dueno.email);
  ok("le llega el correo de verificación", mails.length === 1 && /Confirma/.test(mails[0]?.asunto ?? ""), mails);
  const verif = enlaceDe(mails[0]);
  const v = await fetch(verif, { redirect: "manual" });
  ok("abrir el enlace verifica (redirección)", [200, 302, 307].includes(v.status), v.status);
  const [ver] = await sql`select email_verified from "user" where email = ${dueno.email}`;
  ok("el correo quedó verificado", ver?.email_verified === true);

  await fetch(`${BASE}/api/dev/mail-mock`, { method: "DELETE" });
  r = await post(sesion(), "/api/cuenta/olvide", { username: dueno.username.toUpperCase() });
  ok("olvidé (verificado) → la misma respuesta", r.status === 200 && r.json?.message === uniforme);
  mails = await correosPara(dueno.email);
  ok("le llega el enlace para restablecer", mails.length === 1 && /Restablece/.test(mails[0]?.asunto ?? ""), mails);
  ok("el correo NO trae la contraseña", !mails[0]?.texto?.includes(dueno.password));
  const reset = enlaceDe(mails[0]);
  const g = await fetch(reset, { redirect: "manual" });
  const destino = g.headers.get("location") ?? "";
  const token = new URL(destino, BASE).searchParams.get("token");
  ok("el enlace lleva a /restablecer con su token", destino.includes("/restablecer") && Boolean(token), destino);
  const [{ n: planos }] = await sql`select count(*)::int n from verification where identifier like ${"%" + token + "%"}`;
  ok("el token NO está en claro en la base", planos === 0);
  const NUEVA = "nueva-clave-lupita-9";
  r = await post(sesion(), "/api/auth/reset-password", { newPassword: NUEVA, token });
  ok("restablecer con el token → 200", r.res.ok, r.json);
  ok("entra con la nueva", await puedeEntrar(dueno.username, NUEVA));
  ok("ya no con la anterior", !(await puedeEntrar(dueno.username, dueno.password)));
  ok("sus sesiones abiertas se cerraron", (await d.api("/api/conversations")).status === 401);
  r = await post(sesion(), "/api/auth/reset-password", { newPassword: "otra-clave-cualquiera-1", token });
  ok("el mismo enlace no sirve dos veces", !r.res.ok, r.status);

  // Vencido: se pide otro y se envejece en la base.
  await fetch(`${BASE}/api/dev/mail-mock`, { method: "DELETE" });
  await post(sesion(), "/api/cuenta/olvide", { username: dueno.username });
  const g2 = await fetch(enlaceDe((await correosPara(dueno.email))[0]), { redirect: "manual" });
  const token2 = new URL(g2.headers.get("location") ?? "", BASE).searchParams.get("token");
  await sql`update verification set expires_at = now() - interval '1 minute' where value = (select id from "user" where email = ${dueno.email})`;
  r = await post(sesion(), "/api/auth/reset-password", { newPassword: "vencida-clave-1234", token: token2 });
  ok("un enlace vencido no sirve", !r.res.ok, r.status);

  // Límite: el 4º pedido en una hora para el mismo usuario no manda nada (y responde igual).
  await fetch(`${BASE}/api/dev/mail-mock`, { method: "DELETE" });
  r = await post(sesion(), "/api/cuenta/olvide", { username: dueno.username });
  ok("con el límite por usuario lleno: misma respuesta, sin correo", r.json?.message === uniforme && (await correosPara(dueno.email)).length === 0);

  // ------------------------------------------------- cambio de contraseña
  console.log("\n== Cambio de contraseña de Optimus en «Mi cuenta» ==");
  const NUEVA_OPT = `Opt-${RUN}-segura-1`;
  r = await post(su, "/api/auth/change-password", { currentPassword: "mala-123456", newPassword: NUEVA_OPT });
  ok("con la actual equivocada → rechazado", !r.res.ok);
  r = await post(su, "/api/auth/change-password", { currentPassword: OPT, newPassword: NUEVA_OPT, revokeOtherSessions: true });
  ok("cambiar → 200", r.res.ok, r.json);
  secretos.push(NUEVA_OPT);
  ok("entra con la nueva", await puedeEntrar("optimus", NUEVA_OPT));
  ok("ya no con la inicial", !(await puedeEntrar("optimus", OPT)));

  // -------------------------------------------------- usuarios en /admin
  console.log("\n== /admin → Usuarios ==");
  r = await su.api("/api/admin/users");
  const users = r.json?.users ?? [];
  const opt = users.find((u) => u.username === "Optimus");
  const lupita = users.find((u) => u.email === dueno.email);
  const cajero = users.find((u) => u.email === `cajero@${slug}.test`);
  ok("lista con usuario, correo, verificado y negocios", Boolean(opt && lupita?.emailVerified && lupita?.negocios?.[0]?.slug === slug), lupita);
  r = await su.api(`/api/admin/users/${opt?.id}`, { method: "DELETE" });
  ok("no se borra al superadministrador → 409", r.status === 409, r.json);
  r = await su.api(`/api/admin/users/${lupita?.id}`, { method: "DELETE" });
  ok("no se borra a la única dueña de un negocio → 409", r.status === 409 && r.json?.error?.code === "unico_dueno", r.json);
  r = await post(su, `/api/admin/users/${cajero?.id}/reset-link`);
  ok("enlace de restablecimiento copiable", r.status === 200 && /\/api\/auth\/reset-password\//.test(r.json?.url ?? ""), r.json);
  const g3 = await fetch(r.json?.url, { redirect: "manual" });
  const token3 = new URL(g3.headers.get("location") ?? "", BASE).searchParams.get("token");
  r = await post(sesion(), "/api/auth/reset-password", { newPassword: "cajero-nueva-123", token: token3 });
  ok("…y funciona", r.res.ok && (await puedeEntrar(`cajero_${RUN}`, "cajero-nueva-123")));
  r = await su.api(`/api/admin/users/${cajero?.id}`, { method: "DELETE" });
  ok("borrar una cuenta de equipo → 200", r.status === 200, r.json);
  ok("…ya no entra", !(await puedeEntrar(`cajero_${RUN}`, "cajero-nueva-123")));

  // ------------------------------------------- datos de la cuenta (067)
  console.log("\n== «Mi cuenta»: nombre y correo ==");
  const dd = sesion();
  ok("la dueña entra", (await dd.entrar(dueno.username, NUEVA)).res.ok);
  r = await post(dd, "/api/auth/update-user", { name: "Lupita Nueva" });
  ok("cambiar el nombre → 200", r.res.ok, r.json);
  ok("la sesión trae el nombre nuevo", (await dd.api("/api/auth/get-session")).json?.user?.name === "Lupita Nueva");
  const correo = (s, email, password) => post(s, "/api/cuenta/email", { email, password });
  ok("cambiar correo sin sesión → 401", (await correo(sesion(), "x@x.test", "x")).status === 401);
  ok("correo inválido → 422", (await correo(dd, "no-es-correo", NUEVA)).status === 422);
  ok("el mismo correo → 422", (await correo(dd, dueno.email, NUEVA)).status === 422);
  ok("contraseña equivocada → 403", (await correo(dd, `nuevo@${slug}.test`, "equivocada-123")).status === 403);
  ok("un correo de otra cuenta → 409", (await correo(dd, process.env.SUPERADMIN_RECOVERY_EMAIL, NUEVA)).status === 409);
  r = await correo(dd, `Nuevo@${slug.toUpperCase()}.test`, NUEVA);
  ok("cambio de correo → 200, normalizado", r.res.ok && r.json?.email === `nuevo@${slug}.test`, r.json);
  const [nv] = await sql`select email_verified from "user" where email = ${`nuevo@${slug}.test`}`;
  ok("el correo nuevo queda SIN verificar", nv?.email_verified === false);
  ok("sigue entrando con su usuario (el correo no es para entrar)", await puedeEntrar(dueno.username, NUEVA));
  dueno.email = `nuevo@${slug}.test`;
  r = await post(dd, "/api/auth/update-user", { username: `Lupe_${RUN}`.slice(0, 30), displayUsername: `Lupe_${RUN}`.slice(0, 30) });
  ok("cambiar su usuario → 200", r.res.ok, r.json);
  ok("entra con el usuario nuevo", await puedeEntrar(`lupe_${RUN}`.slice(0, 30), NUEVA));
  ok("ya no con el anterior", !(await puedeEntrar(dueno.username, NUEVA)));
  dueno.username = `Lupe_${RUN}`.slice(0, 30);

  // ------------------------------------------------------- bitácora
  console.log("\n== Bitácora ==");
  const acciones = (await sql`select action from audit_log`).map((a) => a.action);
  for (const a of ["superadmin.creado", "superadmin.credenciales_vistas", "password.reset_solicitado"]) {
    ok(`registra ${a}`, acciones.includes(a), acciones);
  }
  ok("registra el alta y el borrado hechos en /admin", acciones.some((a) => a === "admin POST /tenants") && acciones.some((a) => a.startsWith("admin DELETE /users/")) && acciones.includes("cuenta.correo_cambiado"));
  const detalles = JSON.stringify(await sql`select * from audit_log`);
  ok("la bitácora no guarda contraseñas", !secretos.some((s) => detalles.includes(s)) && !detalles.includes(NUEVA));

  // -------------------------------------------------------- navegador
  await navegador(orgId, dueno, NUEVA);
  return fin();
}

async function navegador(_orgId, dueno, clave) {
  console.log("\n== Navegador: login, olvidé, restablecer ==");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ baseURL: BASE })).newPage();
    await page.goto("/login");
    ok("el login pide Usuario (no correo)", (await page.locator("#username").count()) === 1 && (await page.locator("#email").count()) === 0);
    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
    await page.waitForURL((u) => u.pathname === "/olvide");
    await fetch(`${BASE}/api/dev/mail-mock`, { method: "DELETE" });
    await sleep(100);
    // El límite por usuario ya se llenó con la API: se usa la pantalla con otro.
    await page.fill("#olvide-usuario", `nadie_${RUN}`);
    await page.getByRole("button", { name: "Enviarme el enlace" }).click();
    ok("olvidé: la pantalla da la respuesta uniforme", await page.getByText(/Si ese usuario existe/).waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
    await page.goto("/restablecer?token=inventado");
    await page.fill("#rest-nueva", "algo-nuevo-1234");
    await page.fill("#rest-repetida", "algo-nuevo-1234");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    ok("restablecer con un token inventado avisa", await page.getByText(/venció o ya se usó/).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
    await page.goto("/login");
    await page.fill("#username", dueno.username);
    await page.fill("#password", clave);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    ok("el dueño entra por la pantalla con su usuario", !page.url().includes("/login"));
    await page.goto("/cuenta");
    ok("«Mi cuenta» muestra su usuario y el correo sin verificar", (await page.inputValue("#cuenta-usuario")) === dueno.username && (await page.getByText("sin verificar").count()) > 0);
    await page.getByRole("button", { name: "Enviarme el enlace de verificación" }).click();
    ok("…y le ofrece verificarlo", await page.getByText(/Te mandamos un enlace/).waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
    await page.screenshot({ path: ".tmp-e2e-acceso-cuenta.png", fullPage: true });
  } catch (err) {
    ok("navegador sin errores", false, String(err).slice(0, 300));
  } finally {
    await browser.close();
  }
}

async function fin() {
  if (LOG) {
    await sleep(500);
    const log = readFileSync(LOG, "utf8");
    ok("ninguna contraseña aparece en el log del servidor", !secretos.some((s) => log.includes(s)));
    ok("el log anuncia a Optimus sin su contraseña", /superadministrador «Optimus» creado/.test(log));
  }
  console.log(`\n${checks - failures}/${checks} checks OK`);
  await sql.end();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end().catch(() => {});
  process.exit(1);
});
