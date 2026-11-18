import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";
import { BrandLogo } from "@/components/brand-mark";
import { SalirButton } from "@/components/admin/salir-button";
import { getSessionOrNull } from "@/lib/auth/session";
import { esSuperadminUsuario } from "@/server/tenants/superadmin";

export const dynamic = "force-dynamic";

/**
 * 067 — «Mi cuenta»: para cualquiera con sesión, pertenezca o no a un negocio
 * (un superusuario puede no tenerlo). Por eso vive fuera del layout de la app.
 */
export default async function CuentaLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuth()
    .api.getSession({ headers: await headers() })
    .catch(() => null);
  if (!session) redirect("/login");
  const [branding, negocio] = await Promise.all([
    getBranding().catch(() => DEFAULT_BRANDING),
    getSessionOrNull(),
  ]);
  const superadmin = await esSuperadminUsuario(session.user.id);
  return (
    <div className="min-h-screen bg-subtle">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href={negocio ? "/inbox" : "/admin"} className="flex items-center gap-3">
            <BrandLogo branding={branding} size="md" />
          </Link>
          <div className="ml-auto flex items-center gap-1 text-sm">
            {negocio && (
              <Link href="/inbox" className="rounded-md px-3 py-1.5 text-text-2 hover:bg-accent hover:text-foreground">
                Ir a mi CRM
              </Link>
            )}
            {superadmin && (
              <Link href="/admin" className="rounded-md px-3 py-1.5 text-text-2 hover:bg-accent hover:text-foreground">
                Negocios
              </Link>
            )}
            <SalirButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
