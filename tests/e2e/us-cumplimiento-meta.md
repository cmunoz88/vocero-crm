# E2E — 069 Cumplimiento con Meta y Coexistence

Automatizado: `pnpm test:e2e:cumplimiento-meta` (`scripts/e2e-cumplimiento-meta.mjs`,
35 checks). Requiere la app con mocks (`WA_MOCK_ENABLED=true`,
`META_GRAPH_BASE_URL` al wa-mock), `META_APP_ID`, `META_EMBEDDED_CONFIG_ID`,
`META_APP_SECRET`, `LEGAL_NAME` y `LEGAL_CONTACT_EMAIL`.

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | Abrir `/privacidad`, `/terminos` y `/eliminar-datos` sin sesión | 200, título, nombre legal y correo |
| 2 | `/eliminar-datos?codigo=<18 hex inventado>` | «No encontramos una solicitud» |
| 3 | Alta con `coexistence: true` | 200, `registered: false`, sin PIN, conexión `connected` |
| 4 | Ambos callbacks con firma ajena, formato roto o sin campo | 400 y la conexión intacta |
| 5 | Desautorización de un usuario sin conexiones | 200, no toca otras |
| 6 | Desautorización del usuario que autorizó (dos veces) | 200; conexión `reconnect_required`; idempotente |
| 7 | Eliminación de datos | 200 con `url` y `confirmation_code`; conexión borrada |
| 8 | Abrir la `url` devuelta | «Solicitud completada», el código y «Se eliminaron 1 conexión»; sin `user_id` |
| 9 | Repetir la eliminación | otro código; la página dice «sin datos» |
