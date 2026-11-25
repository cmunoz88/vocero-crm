import Link from "next/link";

/**
 * 069 — Páginas públicas sin sesión (privacidad, términos, eliminación de
 * datos). Meta las abre desde el panel de la app y desde el diálogo de
 * «Conectar con Meta», así que tienen que cargar sin login ni marca de tenant.
 */
export default function PublicoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-2xl space-y-6 px-5 py-12 text-sm leading-relaxed">{children}</main>
      <footer className="mx-auto max-w-2xl border-t border-border px-5 py-6 text-xs text-muted-foreground">
        <nav className="flex gap-4">
          <Link href="/privacidad" className="hover:underline">
            Privacidad
          </Link>
          <Link href="/terminos" className="hover:underline">
            Términos
          </Link>
          <Link href="/eliminar-datos" className="hover:underline">
            Eliminar mis datos
          </Link>
        </nav>
      </footer>
    </div>
  );
}
