# Varios números y varios agentes por negocio (068)

Un negocio puede tener **varios números de WhatsApp** y **varios agentes**.

## Cómo se comporta

- **Número principal.** El número que se conecta en *Ajustes → WhatsApp*, o con
  Embedded Signup, es el principal. Con él salen:
  - las plantillas y la Conversions API;
  - todo lo que no tiene número propio, como iniciar una conversación desde un contacto.
- **Más números.** Se agregan en *Ajustes → Números y agentes*. Para cada uno se pide:
  - un nombre («Ventas», «Soporte»);
  - el ID de la WABA;
  - el ID del número;
  - un token.

  El CRM verifica el número contra Meta, cifra el token (AES-256-GCM) y registra el webhook
  de la instancia en ese número. Del token solo se muestran los últimos 4 caracteres.
- **Una conversación por cliente *y* número.** Si el mismo cliente escribe a
  dos números, aparecen dos conversaciones. Cada conversación guarda su
  `wa_phone_number_id`, y las respuestas, plantillas y el «escribiendo…» salen desde **ese**
  número. Si ese número se quita, se contesta desde el principal.
- **Agentes.** El agente principal es el **interruptor de la IA de todo el
  negocio**: si está apagado, no se despacha nada. Hay dos modos:
  - *Un agente para todos los números* (`compartido`, el de siempre).
  - *Un agente por número* (`por_numero`): cada número contesta con su agente
    asignado, o con el principal si no tiene uno. Un agente secundario apagado
    deja su número sin respuesta automática.
- **Para el cerebro (Nea).** Si atiende un agente que no es el principal, el evento de despacho
  trae `agent: { id, name }` al final. El cerebro lee su perfil con
  `GET /api/bot/profile?agentId=…` (o `?conversationId=…`). Sin `agent`, el
  evento es idéntico al de antes: un cerebro que no conoce los agentes sigue
  funcionando con el principal.

## Aislamiento

- `phone_number_id` es único en toda la plataforma, porque el webhook enruta por él. Si
  se intenta conectar un número que ya está en otro negocio, la respuesta es
  `409 numero_ocupado`, sin decir de quién es.
- Toda lectura y escritura de números y agentes pasa por `scoped()`. Si un negocio pide
  un número o agente de otro, recibe `404`, igual que si no existiera.
  Lo cubre `scripts/e2e-numeros.mjs`.

## Límites de Meta a tener en cuenta

- Cada número tiene que estar **registrado en Cloud API** y pertenecer a una WABA
  a la que la app esté suscrita. La WABA se suscribe sola al conectar.
- Una WABA nueva empieza con un **límite bajo de números** (normalmente 2) hasta que el
  negocio verifica el portafolio en Meta Business. Los números adicionales se
  agregan desde WhatsApp Manager.
- El **límite de mensajería** (conversaciones iniciadas por el negocio cada 24 h)
  se cuenta **por portafolio**, no por número.
- Con **Embedded Signup**, el cliente elige un número a la vez. Para sumar otro,
  conéctalo con su token en *Números y agentes*, o repite el Embedded Signup y
  luego marca como principal el que corresponda.

## Migración

La migración `0030_numeros_y_agentes` es aditiva y re-ejecutable. Al aplicarse,
lo existente se marca como principal:
- el número que ya había;
- el agente que ya había.

Además, cada conversación de WhatsApp queda con el número de su negocio. Cambian dos índices:
- el de «un número por negocio» pasa a «un principal por negocio»;
- el de «una conversación por contacto» pasa a «una por contacto y número».
