import { listarUsuarios } from "@/server/platform/users";
import { withSuperadmin } from "@/server/tenants/api";

export const dynamic = "force-dynamic";

/** 068 — Todas las cuentas de la plataforma. */
export const GET = withSuperadmin(async () => Response.json({ users: await listarUsuarios() }));
