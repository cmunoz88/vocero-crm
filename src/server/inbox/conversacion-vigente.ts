import { sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { schema } from "@/lib/db";

/**
 * 068 — Con varios números, un contacto puede tener una conversación real por
 * cada número del negocio. Donde una vista muestra UNA por contacto (tablero,
 * Resultados, conversiones), se une con la más reciente; así el lead no se
 * duplica. Úsalo como condición extra del join con `conversation`.
 */
export function esConversacionVigente(contactIdColumn: PgColumn): SQL {
  return sql`${schema.conversation.id} = (
    select c2.id from conversation c2
    where c2.organization_id = ${schema.conversation.organizationId}
      and c2.contact_id = ${contactIdColumn}
      and c2.is_test = false
    order by c2.last_message_at desc nulls last, c2.id
    limit 1
  )`;
}
