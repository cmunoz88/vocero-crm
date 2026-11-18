import { mockGuard } from "@/lib/dev-guard";
import { buzonMock } from "@/server/email";

export const dynamic = "force-dynamic";

/** 068 — Buzón del entorno de pruebas: los correos que «salieron» con SMTP_HOST=mock. 404 en producción. */
export async function GET(req: Request) {
  const blocked = mockGuard();
  if (blocked) return blocked;
  const para = new URL(req.url).searchParams.get("para")?.toLowerCase();
  const enviados = buzonMock().enviados.filter((c) => !para || c.para.toLowerCase() === para);
  return Response.json({ enviados });
}

export async function DELETE() {
  const blocked = mockGuard();
  if (blocked) return blocked;
  buzonMock().enviados.length = 0;
  return Response.json({ ok: true });
}
