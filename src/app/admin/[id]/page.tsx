import { TenantDetailClient } from "@/components/admin/tenant-detail-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Negocio · Plataforma" };

export default async function AdminTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TenantDetailClient id={id} />;
}
