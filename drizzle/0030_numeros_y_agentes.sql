-- 068: varios números de WhatsApp y varios agentes por negocio. Aditiva y
-- re-ejecutable. Lo que ya existe queda igual: el número que había es el
-- principal, el agente que había es el principal, y cada conversación de
-- WhatsApp queda con el número de su negocio.
ALTER TABLE "agent_profile" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_profile" ADD COLUMN IF NOT EXISTS "model" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN IF NOT EXISTS "wa_phone_number_id" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN IF NOT EXISTS "label" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN IF NOT EXISTS "agent_profile_id" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN IF NOT EXISTS "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "agent_mode" text DEFAULT 'compartido' NOT NULL;--> statement-breakpoint
UPDATE "meta_credentials" m SET "is_primary" = true
WHERE NOT EXISTS (SELECT 1 FROM "meta_credentials" p WHERE p."organization_id" = m."organization_id" AND p."is_primary")
  AND m."id" = (SELECT x."id" FROM "meta_credentials" x WHERE x."organization_id" = m."organization_id" ORDER BY x."created_at", x."id" LIMIT 1);--> statement-breakpoint
UPDATE "agent_profile" a SET "is_default" = true
WHERE NOT EXISTS (SELECT 1 FROM "agent_profile" d WHERE d."organization_id" = a."organization_id" AND d."is_default")
  AND a."id" = (SELECT x."id" FROM "agent_profile" x WHERE x."organization_id" = a."organization_id" ORDER BY x."created_at", x."id" LIMIT 1);--> statement-breakpoint
UPDATE "conversation" c SET "wa_phone_number_id" = m."phone_number_id"
FROM "meta_credentials" m
WHERE m."organization_id" = c."organization_id" AND m."is_primary"
  AND c."channel" = 'whatsapp' AND c."wa_phone_number_id" IS NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "agent_profile_org_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "conversation_org_contact_real_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "meta_credentials_org_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_profile_org_default_uq" ON "agent_profile" USING btree ("organization_id") WHERE "agent_profile"."is_default" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_profile_org_idx" ON "agent_profile" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_org_contact_num_real_uq" ON "conversation" USING btree ("organization_id","contact_id",coalesce("wa_phone_number_id", '')) WHERE "conversation"."is_test" = false;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meta_credentials_org_primary_uq" ON "meta_credentials" USING btree ("organization_id") WHERE "meta_credentials"."is_primary" = true;
