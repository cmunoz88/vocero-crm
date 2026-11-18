import { UsersClient } from "@/components/admin/users-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuarios · Plataforma" };

export default function UsuariosPage() {
  return <UsersClient />;
}
