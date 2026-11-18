# Tasks: Multi-tenant con superusuario

**Spec**: [spec.md](spec.md)

- [x] T001 Esquema: `organization.status`/`suspended_at`; tabla `brain_connection` (org única, URLs, llave cifrada + hash único); migración 0027
- [x] T002 `server/tenants/`: superusuario (`SUPERADMIN_EMAILS`), validación de web ID, crear (siembra compartida con el primer registro), suspender/reactivar, borrar (BD + MEDIA_DIR + usuarios huérfanos)
- [x] T003 Sesión: tenant suspendido → 401; superusuario sin membresía
- [x] T004 Cerebro por tenant: `configDespachoDeOrg`, `urlSaludCerebroDeOrg`; worker, deliver, estado, onboarding, perfil, lab y brain-status por org; health cache y «visto» por org
- [x] T005 `/api/bot/*`: llave → org (env → org principal); suspendido → 401
- [x] T006 Webhook WA: número de tenant suspendido se descarta
- [x] T007 API `/api/admin/tenants*` (404 a no-superusuarios)
- [x] T008 UI `/admin` (lista, alta, detalle con cerebro, suspender, borrar) + entrada en el menú
- [x] T009 `/t/[slug]` y `/t/[slug]/login` con la marca del tenant y verificación de pertenencia
- [x] T010 Unit tests + arnés E2E `scripts/e2e-multi-tenant.mjs`
- [x] T011 Docs (`.env.example`, AGENTS/CLAUDE, CHANGELOG) + gates
- [ ] T012 Deploy a Coolify con `SUPERADMIN_EMAILS` + verificación en vivo
