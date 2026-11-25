import type { Metadata } from "next";
import { datosLegales } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Términos del servicio" };

export default function Terminos() {
  const d = datosLegales();
  return (
    <>
      <h1 className="text-2xl font-semibold">Términos del servicio</h1>
      <p className="text-muted-foreground">Última actualización: {d.actualizado}</p>
      <p>
        Al usar el CRM de {d.nombre} aceptas estos términos. Si lo usas en nombre de un negocio, confirmas que
        puedes obligarlo.
      </p>

      <h2 className="text-lg font-semibold">El servicio</h2>
      <p>
        Es una bandeja de WhatsApp con contactos, pipeline y herramientas de apoyo. Cada negocio conecta su
        propia cuenta de WhatsApp Business y es responsable de ella.
      </p>

      <h2 className="text-lg font-semibold">Uso aceptable</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Escribe solo a personas que aceptaron recibir tus mensajes (opt-in).</li>
        <li>
          Cumple los términos de WhatsApp Business y la política de mensajería de Meta, incluida la ventana de
          24 horas y las plantillas aprobadas.
        </li>
        <li>No uses el servicio para spam, fraude, contenido ilegal ni para vulnerar a terceros.</li>
      </ul>

      <h2 className="text-lg font-semibold">Tus datos</h2>
      <p>
        Los datos de tus conversaciones son tuyos. Los tratamos como describe la{" "}
        <a className="underline" href="/privacidad">
          política de privacidad
        </a>
        . Puedes desconectar tu cuenta o pedir su eliminación en cualquier momento.
      </p>

      <h2 className="text-lg font-semibold">Suspensión</h2>
      <p>
        Podemos suspender un negocio que incumpla estos términos o ponga en riesgo la cuenta de WhatsApp de
        otros. La suspensión conserva los datos hasta que se pida su eliminación.
      </p>

      <h2 className="text-lg font-semibold">Responsabilidad</h2>
      <p>
        El servicio depende de Meta y de proveedores externos y se ofrece tal cual: no garantizamos que esté
        libre de interrupciones.
      </p>

      <h2 className="text-lg font-semibold">Contacto</h2>
      <p>
        {d.correo ? (
          <>
            <a className="underline" href={`mailto:${d.correo}`}>{d.correo}</a>
          </>
        ) : (
          <>Escribe a quien administra el servicio que usas.</>
        )}
      </p>
    </>
  );
}
