/**
 * Self-test 067 — «Mi cuenta» y el rescate del superusuario
 * (`SUPERADMIN_SET_PASSWORD`). Va por fases porque entre una y otra la app se
 * reinicia con otro entorno:
 *
 *   antes   app SIN la variable: el dueño de la principal se registra
 *           (super@principal.test, contraseña original).
 *   rescate app CON SUPERADMIN_EMAILS=super@principal.test,nuevo@rescate.test
 *           y SUPERADMIN_SET_PASSWORD=test123$: la cuenta existente queda con
 *           test123$, la que no existía se crea; el nuevo entra a /admin sin
 *           negocio y cambia su contraseña en /cuenta.
 *   despues app SIN la variable otra vez: el reinicio no vuelve a pisar nada.
 *
 *   node --env-file=<entorno> scripts/e2e-cuenta.mjs <fase>
 */
const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const fase = process.argv[2];
let checks = 0;
let failures = 0;
const ok = (name, cond, extra = "") => {
  checks++;
  if (cond) console.log(`  OK  ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${extra ? ` — ${JSON.stringify(extra)}` : ""}`);
  }
};

function sesion() {
  let cookie = "";
  const api = async (ruta, opts = {}) => {
    const res = await fetch(`${BASE}${ruta}`, {
      redirect: "manual",
      ...opts,
      headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}), ...(opts.headers ?? {}) },
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
    entrar: (email, password) =>
      api("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email, password }) }),
  };
}
const puedeEntrar = async (email, password) => (await sesion().entrar(email, password)).res.ok;

const ORIGINAL = "password-original-1";
const NUEVA = "nueva-clave-segura-9";

if (fase === "antes") {
  console.log("== antes: el dueño de la principal ==");
  const s = sesion();
  const r = await s.api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email: "super@principal.test", password: ORIGINAL, name: "Dueño" }),
  });
  ok("registro del dueño de la principal", r.res.ok, r.json);
  ok("la cuenta nueva aún no existe", !(await puedeEntrar("nuevo@rescate.test", "test123$")));
} else if (fase === "rescate") {
  console.log("== rescate: SUPERADMIN_SET_PASSWORD=test123$ ==");
  const filtro = process.env.SUPERADMIN_SET_PASSWORD_FOR ?? "";
  if (!filtro || filtro.includes("super@principal.test")) {
    ok("la cuenta existente ahora entra con test123$", await puedeEntrar("super@principal.test", "test123$"));
    ok("…y ya no con la original", !(await puedeEntrar("super@principal.test", ORIGINAL)));
  } else {
    ok("_FOR: la cuenta fuera de la lista conserva su contraseña", await puedeEntrar("super@principal.test", ORIGINAL));
    ok("_FOR: …y test123$ no le sirve", !(await puedeEntrar("super@principal.test", "test123$")));
  }
  const n = sesion();
  ok("la cuenta que no existía se creó y entra con test123$", (await n.entrar("nuevo@rescate.test", "test123$")).res.ok);
  ok("el superusuario sin negocio ve /admin", (await n.api("/admin")).status === 200);
  const raiz = await n.api("/inbox");
  ok(
    "sin negocio, la app lo manda a /admin",
    [307, 308].includes(raiz.status) && (raiz.res.headers.get("location") ?? "").endsWith("/admin"),
    raiz.res.headers.get("location")
  );
  ok("/cuenta abre", (await n.api("/cuenta")).status === 200);
  ok("/cuenta sin sesión → al login", [307, 308].includes((await sesion().api("/cuenta")).status));
  let r = await n.api("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword: "equivocada-123", newPassword: NUEVA }),
  });
  ok("cambiar con la contraseña actual equivocada → rechazado", !r.res.ok, r.status);
  r = await n.api("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword: "test123$", newPassword: NUEVA, revokeOtherSessions: true }),
  });
  ok("cambiar la contraseña → 200", r.res.ok, r.json);
  ok("entra con la nueva", await puedeEntrar("nuevo@rescate.test", NUEVA));
  ok("ya no con test123$", !(await puedeEntrar("nuevo@rescate.test", "test123$")));
  ok("su sesión actual sigue abierta", (await n.api("/admin")).status === 200);
} else if (fase === "despues") {
  console.log("== después: sin la variable, el reinicio no pisa nada ==");
  ok("el nuevo sigue con SU contraseña", await puedeEntrar("nuevo@rescate.test", NUEVA));
  ok("test123$ no volvió", !(await puedeEntrar("nuevo@rescate.test", "test123$")));
} else {
  console.error("fase: antes | rescate | despues");
  process.exit(2);
}
console.log(`${checks - failures}/${checks} checks OK`);
process.exit(failures ? 1 : 0);
