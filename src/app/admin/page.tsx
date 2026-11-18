import { InvitacionesClient } from "@/components/admin/invitaciones-client";
import { TenantsClient } from "@/components/admin/tenants-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Negocios · Plataforma" };

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <TenantsClient />
      <InvitacionesClient />
    </div>
  );
}
