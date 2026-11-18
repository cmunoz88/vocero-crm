import { notFound, redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { tenantPorSlug } from "@/server/tenants/service";

export const dynamic = "force-dynamic";

/**
 * 067 — El web ID de un negocio. Con sesión de ESE negocio, a la app; si no,
 * a su login.
 */
export default async function TenantHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await tenantPorSlug(slug);
  if (!org) notFound();
  const session = await getSessionOrNull();
  if (session?.organizationId === org.id) redirect("/");
  redirect(`/t/${org.slug ?? slug}/login`);
}
