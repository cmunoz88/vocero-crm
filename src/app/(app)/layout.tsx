import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getSessionOrNull } from "@/lib/auth/session";
import { resolveMembership } from "@/server/auth/on-signup";
import { esSuperadmin } from "@/server/tenants/superadmin";
import { aparienciaActual } from "@/server/apariencia";
import { getBranding } from "@/server/branding";
import { AppShell } from "@/components/app-shell";
import { resolveCommit } from "@/lib/version";
import { agendaEnabled } from "@/server/agenda/flag";
import { enabledChannels } from "@/server/channels/enabled";
import { navKicker } from "@/lib/channels";
import { avisoIaDe } from "@/server/ai/aviso";
import { AvisoIaBanner } from "@/components/avisos/aviso-ia";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionOrNull();
  const authSession = await getAuth().api.getSession({
    headers: await headers(),
  });
  const superadmin = esSuperadmin(authSession?.user.email);
  if (!session) {
    // 067 — El superusuario no necesita pertenecer a un negocio: su casa es
    // /admin. Quien pertenece a uno suspendido lo ve dicho en el login.
    if (superadmin) redirect("/admin");
    if (authSession) {
      const m = await resolveMembership(authSession.user.id);
      if (m?.orgStatus === "suspended") redirect("/login?motivo=suspendido");
    }
    redirect("/login");
  }
  const branding = await getBranding(session.organizationId);
  // 062 — Para el botón de sol y luna: salta a la pareja del tema actual.
  const { apariencia } = await aparienciaActual(session.organizationId);
  // El agente encendido y sin con qué pensar se ve desde fuera igual que un
  // bot roto. Se resuelve en el servidor y en el layout para que se vea desde
  // CUALQUIER pantalla, no solo desde el panel de un contacto (#85).
  const aviso = await avisoIaDe(session.organizationId);

  return (
    <AppShell
      branding={branding}
      userName={authSession?.user.name ?? "Usuario"}
      role={session.role}
      apariencia={apariencia}
      // Se resuelve aquí, en el servidor: el cliente no ve `SOURCE_COMMIT`.
      // Baja con su procedencia, para que la insignia no presente como
      // verificado un commit que no salió del build (#50).
      commit={resolveCommit()}
      // Qué módulos opcionales existen se decide en el servidor y baja por
      // prop, igual que los canales de la Bandeja. El nav es un componente de
      // cliente: no puede —ni debe— leer variables de entorno.
      agenda={agendaEnabled()}
      superadmin={superadmin}
      kicker={navKicker([...enabledChannels()])}
      aviso={<AvisoIaBanner aviso={aviso} />}
    >
      {children}
    </AppShell>
  );
}
