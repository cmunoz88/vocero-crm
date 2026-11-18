import { notFound } from "next/navigation";
import { revelacionHabilitada } from "@/server/platform/optimus";
import { RevelarCredenciales } from "./revelar";

export const dynamic = "force-dynamic";

/** 068 — Vista única de la contraseña inicial del superadministrador. Sin SETUP_REVEAL_TOKEN: 404. */
export default function CredencialesPage() {
  if (!revelacionHabilitada()) notFound();
  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle p-4">
      <RevelarCredenciales />
    </main>
  );
}
