import { LoginForm } from "@/components/auth/login-form";
import { isPublicSignupAllowed } from "@/server/auth/registration";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  // 067 — «Crear la cuenta inicial» solo mientras la instancia esté vacía.
  const registro = await isPublicSignupAllowed().catch(() => false);
  return <LoginForm motivo={motivo} mostrarRegistro={registro} />;
}
