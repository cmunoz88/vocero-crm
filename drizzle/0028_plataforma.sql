-- 068: plataforma multiempresa — usuario para entrar, rol global, bitácora y
-- secretos de una sola vista. Aditiva y re-ejecutable. Los usuarios existentes
-- reciben su nombre de usuario al arrancar (src/server/platform/usernames.ts).
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_label" text,
	"action" text NOT NULL,
	"organization_id" text,
	"target_type" text,
	"target_id" text,
	"detail" jsonb,
	"ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "one_time_secret" (
	"id" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"cipher" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "one_time_secret_purpose_unique" UNIQUE("purpose")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "display_username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "platform_role" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_org_idx" ON "audit_log" USING btree ("organization_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
