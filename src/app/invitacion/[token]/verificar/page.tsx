import { CompletarForm, InvitacionInvalida } from "@/components/auth/invitacion-client";
import { verificarCorreoInvitacion } from "@/server/platform/invitaciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Termina tu registro" };

/** 068 — Paso 2 y 3: el enlace del correo verifica y deja elegir usuario y contraseña. */
export default async function VerificarPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const [{ token }, { c }] = await Promise.all([params, searchParams]);
  const inv = c ? await verificarCorreoInvitacion(token, c) : null;
  if (!inv) return <InvitacionInvalida verificacion />;
  return <CompletarForm token={token} codigo={c!} negocio={inv.businessName ?? ""} email={inv.email ?? ""} />;
}
