import { InvitacionInvalida, SolicitarForm } from "@/components/auth/invitacion-client";
import { invitacionVigente } from "@/server/platform/invitaciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registra tu negocio" };

/** 068 — Paso 1: el cliente abre el enlace que le dio el superadministrador. */
export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await invitacionVigente(token);
  if (!inv) return <InvitacionInvalida />;
  return (
    <SolicitarForm
      token={token}
      negocio={inv.businessName ?? ""}
      email={inv.email ?? ""}
      esperando={inv.status === "verificando" || inv.status === "verificada"}
    />
  );
}
