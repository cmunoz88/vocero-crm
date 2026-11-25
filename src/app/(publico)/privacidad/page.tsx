import type { Metadata } from "next";
import { datosLegales } from "@/lib/legal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Política de privacidad" };

export default function Privacidad() {
  const d = datosLegales();
  return (
    <>
      <h1 className="text-2xl font-semibold">Política de privacidad</h1>
      <p className="text-muted-foreground">Última actualización: {d.actualizado}</p>
      <p>
        {d.nombre} ofrece un CRM para conversar con clientes por WhatsApp. Esta política explica qué datos
        tratamos cuando un negocio conecta su cuenta de WhatsApp Business y cuando sus clientes le escriben.
      </p>

      <h2 className="text-lg font-semibold">Qué datos tratamos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <b>De quien administra un negocio:</b> nombre, usuario y correo de la cuenta, y los identificadores
          de su cuenta de WhatsApp Business (cuenta, número) y el token que Meta entrega al autorizar la
          conexión.
        </li>
        <li>
          <b>De los clientes del negocio:</b> el nombre de perfil y el número de teléfono (o el identificador
          que Meta asigne), los mensajes, archivos adjuntos y la hora de cada mensaje.
        </li>
      </ul>

      <h2 className="text-lg font-semibold">Para qué los usamos</h2>
      <p>
        Solo para operar el servicio: mostrar y enviar mensajes, organizar las conversaciones del negocio y
        mantener la conexión con WhatsApp. No vendemos datos ni los usamos para publicidad de terceros.
      </p>

      <h2 className="text-lg font-semibold">Cómo los protegemos</h2>
      <p>
        Cada negocio ve únicamente sus propios datos. Los tokens de acceso se guardan cifrados y nunca se
        muestran completos ni se escriben en registros. La conexión con el servicio es por HTTPS.
      </p>

      <h2 className="text-lg font-semibold">Con quién se comparten</h2>
      <p>
        Con Meta Platforms, porque WhatsApp es su servicio, y con el proveedor de inteligencia artificial que
        el negocio haya activado, solo para generar respuestas. No se comparten con nadie más.
      </p>

      <h2 className="text-lg font-semibold">Tus derechos y cómo borrar tus datos</h2>
      <p>
        Puedes pedir acceso, corrección o eliminación de tus datos. Si autorizaste la conexión con Facebook o
        Meta, puedes quitar la app desde tu configuración de Meta: al hacerlo recibimos el aviso y borramos
        las credenciales que nos diste. Las instrucciones completas están en{" "}
        <a className="underline" href="/eliminar-datos">
          {d.base}/eliminar-datos
        </a>
        .
      </p>

      <h2 className="text-lg font-semibold">Contacto</h2>
      <p>
        {d.correo ? (
          <>
            Escríbenos a <a className="underline" href={`mailto:${d.correo}`}>{d.correo}</a>.
          </>
        ) : (
          <>Escribe a quien administra el servicio que usas.</>
        )}
      </p>
    </>
  );
}
