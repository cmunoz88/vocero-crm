# Tasks: Cumplimiento con Meta, Coexistence y Graph v26

**Spec**: [spec.md](spec.md)

- [x] T001 Migración 0032: `meta_credentials.meta_user_id` + tabla `meta_data_deletion`
- [x] T002 `lib/meta/signed-request.ts` (HMAC-SHA256, tiempo constante)
- [x] T003 `server/meta/cumplimiento.ts` (desautorizar, eliminar, estado por código)
- [x] T004 Rutas `POST /api/meta/desautorizar` y `/api/meta/eliminar-datos`
- [x] T005 Páginas `/privacidad`, `/terminos`, `/eliminar-datos` (grupo `(publico)`) + `LEGAL_NAME`/`LEGAL_CONTACT_EMAIL`
- [x] T006 `embedded.ts`: `meta_user_id` vía `/me`; `coexistence` sin `/register` ni PIN
- [x] T007 Popup: `featureType` siempre; evento de Coexistence admitido
- [x] T008 Graph `v26.0` (env, `.env.example`, Instagram, pruebas)
- [x] T009 wa-mock: `GET me?fields=id`
- [x] T010 Unitarias (`signed-request`, `embedded-signup`)
- [x] T011 E2E `scripts/e2e-cumplimiento-meta.mjs` (35 checks) + guion `tests/e2e/us-cumplimiento-meta.md`
- [x] T012 Docs: `docs/cumplimiento-meta.md`, `docs/embedded-signup.md`, CHANGELOG, `specs/README.md`
- [x] T013 Gate: typecheck, lint, build y test en verde (salvo 2 de `doctor.test.ts`, anteriores: `.env.example` ya trae `APP_BASE_URL` y `DOMAIN` reales)
- [ ] T014 Verificación en vivo con Meta real
