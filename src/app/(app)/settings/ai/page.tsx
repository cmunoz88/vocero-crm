import { iaBloqueada } from "@/server/platform/ia";
import { AiClient } from "@/components/settings/ai-client";

export const dynamic = "force-dynamic";

export default function AiSettingsPage() {
  // 068 — Llave fija: la IA es de la plataforma y el negocio no la configura.
  if (iaBloqueada()) {
    return (
      <div className="max-w-2xl rounded-xl border bg-surface p-5 text-sm">
        <p className="font-semibold">Inteligencia artificial</p>
        <p className="mt-1 text-text-2">
          La IA de tu negocio la administra la plataforma: no necesitas poner una llave. El
          modelo de cada agente se elige en Ajustes → Números y agentes.
        </p>
      </div>
    );
  }
  return <AiClient />;
}
