import { isVoceroName } from "@/lib/brand";
import type { Branding } from "@/lib/branding";
import { enabledChannels } from "@/server/channels/enabled";
import { productName } from "@/lib/channels";
import { BrandLogo } from "@/components/brand-mark";

/**
 * Pantalla de entrada con la escenografía del hero de vocerocrm.com: papel
 * frío, rejilla difuminada y dos resplandores (azul y cian) detrás del
 * formulario. Con la marca Vocero se remata con el titular de la landing; una
 * instancia white-label ve su nombre y una descripción neutra.
 */
export function AuthScene({
  branding,
  negocio,
  children,
}: Readonly<{
  branding: Branding;
  /** 067 — En `/t/{slug}/login`: el nombre del negocio al que se entra. */
  negocio?: string;
  children: React.ReactNode;
}>) {
  const vocero = !negocio && isVoceroName(branding.name);
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-subtle p-4">
      <div className="brand-grid absolute inset-0" aria-hidden />
      <div className="brand-glow brand-glow-a" aria-hidden />
      <div className="brand-glow brand-glow-b" aria-hidden />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <BrandLogo branding={branding} size="lg" />
          {vocero ? (
            <h1 className="text-[24px] font-bold leading-tight tracking-[-0.03em]">
              El CRM{" "}
              <span
                className="bg-clip-text font-serif text-[1.18em] font-normal italic tracking-[-0.01em] text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(92deg, var(--accent) 12%, #00b4f0 88%)",
                }}
              >
                que es tuyo.
              </span>
            </h1>
          ) : (
            <div>
              {negocio ? (
                <h1 className="text-[20px] font-bold leading-tight tracking-[-0.02em]">{negocio}</h1>
              ) : (
                <h1 className="sr-only">{branding.name}</h1>
              )}
              <p className="text-sm text-text-3">
                {productName([...enabledChannels()])} con agente de IA
              </p>
            </div>
          )}
        </div>
        {children}
      </div>
    </main>
  );
}
