import { DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";
import { AuthScene } from "@/components/auth/auth-scene";

/** 068 — El registro por invitación usa la misma escena que el login. */
export default async function InvitacionLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return <AuthScene branding={branding}>{children}</AuthScene>;
}
