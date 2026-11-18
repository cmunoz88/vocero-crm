# US 067 — Multi-tenant con superusuario

Automatizado en `scripts/e2e-multi-tenant.mjs` (`pnpm test:e2e:multi-tenant`,
84 checks: API con varias sesiones, dos cerebros falsos con llaves distintas y
navegador). Requiere `SUPERADMIN_EMAILS=super@principal.test` en la app y una
base limpia (el primer registro es la organización principal).

1. Anónimo y dueño de un negocio: `/admin` y `/api/admin/*` → 404.
2. El superusuario crea dos negocios (web ID inválido/reservado → 422;
   repetido o correo repetido → 409, sin dejar huérfanos). Cada uno nace
   sembrado (5 etapas + perfil del agente).
3. `/t/{slug}/login` muestra el nombre del negocio; `/t/{inexistente}` → 404.
   Una cuenta de otro negocio no entra (se cierra su sesión y se dice).
4. Cada negocio conecta su número; un mensaje a cada número cae solo en su
   negocio; uno no abre conversaciones del otro (404).
5. Cerebro por negocio: el superusuario guarda la URL y genera la llave (se ve
   una vez, en la base va cifrada). El despacho de A llega firmado al cerebro
   de A y nunca al principal; la respuesta llega a la conversación de A; la
   llave de A no ve conversaciones de B. `BOT_API_KEY` del entorno sigue
   valiendo para la principal. Rotar invalida la anterior.
6. Suspender A: su dueño recibe 401 (y en la app, el login con el aviso), su
   llave 401, un mensaje a su número recibe 200 pero no se guarda ni se
   despacha; B sigue igual. Reactivar devuelve todo.
7. Borrar: activo → 409; confirmación equivocada → 422; suspendido + web ID →
   200, sin filas, sin `MEDIA_DIR/{orgId}`, sin la cuenta del dueño. El
   negocio propio no se puede borrar (409). Con la principal suspendida,
   `/admin` sigue abierto para el superusuario.
8. Navegador: «Negocios» en el menú del superusuario; alta, llave, suspensión
   y borrado desde `/admin`.
