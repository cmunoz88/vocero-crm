import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { CuentaClient } from "@/components/auth/cuenta-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi cuenta" };

export default async function CuentaPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return <CuentaClient name={session?.user.name ?? ""} email={session?.user.email ?? ""} />;
}
