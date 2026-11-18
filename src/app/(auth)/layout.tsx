import { DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";
import { AuthScene } from "@/components/auth/auth-scene";

/**
 * Pantalla de entrada con la escenografía del hero de vocerocrm.com. 067 — La
 * escena vive en `AuthScene` para que `/t/{slug}/login` la use con la marca
 * de su negocio.
 */
export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return <AuthScene branding={branding}>{children}</AuthScene>;
}
