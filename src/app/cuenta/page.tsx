import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { correoHabilitado } from "@/server/email";
import { CuentaClient } from "@/components/auth/cuenta-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi cuenta" };

export default async function CuentaPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const [u] = session
    ? await getDb()
        .select({ username: schema.user.displayUsername, verificado: schema.user.emailVerified })
        .from(schema.user)
        .where(eq(schema.user.id, session.user.id))
        .limit(1)
    : [];
  return (
    <CuentaClient
      name={session?.user.name ?? ""}
      email={session?.user.email ?? ""}
      username={u?.username ?? ""}
      emailVerificado={Boolean(u?.verificado)}
      correoDisponible={correoHabilitado()}
    />
  );
}
