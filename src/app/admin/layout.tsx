import Link from "next/link";
import { notFound } from "next/navigation";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";
import { BrandLogo } from "@/components/brand-mark";
import { SalirButton } from "@/components/admin/salir-button";
import { getSessionOrNull } from "@/lib/auth/session";
import { superadminActual } from "@/server/tenants/superadmin";

export const dynamic = "force-dynamic";

/**
 * 067 — Administración de la plataforma. Fuera del layout de la app a
 * propósito: el superusuario no necesita pertenecer a ningún negocio. Para
 * cualquier otra persona, esta sección no existe (404).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await superadminActual();
  if (!admin) notFound();
  const [branding, session] = await Promise.all([
    getBranding().catch(() => DEFAULT_BRANDING),
    getSessionOrNull(),
  ]);
  return (
    <div className="min-h-screen bg-subtle">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href="/admin" className="flex items-center gap-3">
            <BrandLogo branding={branding} size="md" />
          </Link>
          <span className="rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-text-3">
            Plataforma
          </span>
          <div className="ml-auto flex items-center gap-1 text-sm">
            {session && (
              <Link href="/inbox" className="rounded-md px-3 py-1.5 text-text-2 hover:bg-accent hover:text-foreground">
                Ir a mi CRM
              </Link>
            )}
            <Link href="/cuenta" className="rounded-md px-3 py-1.5 text-text-2 hover:bg-accent hover:text-foreground">
              Mi cuenta
            </Link>
            <span className="hidden px-2 text-text-3 sm:inline">{admin.email}</span>
            <SalirButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
