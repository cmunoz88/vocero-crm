import { notFound } from "next/navigation";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { getBranding } from "@/server/branding";
import { AuthScene } from "@/components/auth/auth-scene";
import { LoginForm } from "@/components/auth/login-form";
import { tenantPorSlug } from "@/server/tenants/service";

export const dynamic = "force-dynamic";

/** 067 — La entrada de un negocio: `/t/{slug}/login`, con su marca. */
export default async function TenantLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { slug } = await params;
  const { motivo } = await searchParams;
  const org = await tenantPorSlug(slug);
  if (!org) notFound();
  const branding = await getBranding(org.id).catch(() => DEFAULT_BRANDING);
  return (
    <AuthScene branding={branding} negocio={org.name}>
      <LoginForm
        tenant={{ slug: org.slug ?? slug, name: org.name }}
        motivo={org.status === "suspended" ? "suspendido" : motivo}
        mostrarRegistro={false}
      />
    </AuthScene>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await tenantPorSlug(slug).catch(() => null);
  return { title: org ? `Entrar · ${org.name}` : "No encontrado" };
}
