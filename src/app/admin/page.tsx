import { TenantsClient } from "@/components/admin/tenants-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Negocios · Plataforma" };

export default function AdminPage() {
  return <TenantsClient />;
}
