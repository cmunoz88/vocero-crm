import type { Metadata } from "next";
import { datosLegales } from "@/lib/legal";
import { estadoDeEliminacion } from "@/server/meta/cumplimiento";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Eliminación de datos" };

export default async function EliminarDatos({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { codigo } = await searchParams;
  const d = datosLegales();
  const estado = codigo ? await estadoDeEliminacion(codigo).catch(() => null) : null;

  return (
    <>
      <h1 className="text-2xl font-semibold">Eliminación de datos</h1>

      {codigo && (
        <section
          role="status"
          className="space-y-1 rounded-lg border border-border bg-card p-4"
          data-testid="estado-eliminacion"
        >
          {estado ? (
            <>
              <p className="font-medium">
                {estado.status === "completada" ? "Solicitud completada" : "Solicitud recibida"}
              </p>
              <p>
                Código de confirmación: <span className="font-mono">{codigo}</span>
              </p>
              <p className="text-muted-foreground">
                {estado.status === "completada"
                  ? `Se eliminaron ${estado.numbersRemoved} conexión(es) de WhatsApp con sus credenciales.`
                  : "No encontramos datos asociados a tu cuenta de Meta; no hay nada más que borrar."}
              </p>
            </>
          ) : (
            <p>No encontramos una solicitud con ese código.</p>
          )}
        </section>
      )}

      <p>
        {d.nombre} borra, a tu petición, los datos que Meta le entregó cuando conectaste tu cuenta de WhatsApp
        Business.
      </p>

      <h2 className="text-lg font-semibold">Cómo pedir que borremos tus datos</h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          En Facebook, abre <b>Configuración → Seguridad e inicio de sesión → Apps y sitios web</b>.
        </li>
        <li>Busca esta aplicación y pulsa <b>Eliminar</b>. Marca que también quieres borrar tus datos.</li>
        <li>
          Recibimos el aviso de Meta al instante, borramos tu token y los identificadores de tu cuenta y
          número de WhatsApp, y te damos un código de confirmación.
        </li>
      </ol>
      <p>
        {d.correo ? (
          <>
            También puedes escribir a <a className="underline" href={`mailto:${d.correo}`}>{d.correo}</a>{" "}
            desde el correo de tu cuenta. Respondemos en un máximo de 30 días.
          </>
        ) : (
          <>También puedes pedirlo a quien administra el servicio que usas.</>
        )}
      </p>

      <h2 className="text-lg font-semibold">Qué se borra</h2>
      <p>
        Lo que Meta nos dio al conectar: el token de acceso y los identificadores de la cuenta y del número de
        WhatsApp. Las conversaciones y los contactos pertenecen al negocio que los recibió; para borrarlos
        pídelo a ese negocio. Más detalle en la{" "}
        <a className="underline" href="/privacidad">
          política de privacidad
        </a>
        .
      </p>
    </>
  );
}
