-- 067: multi-tenant con superusuario. Aditiva y re-ejecutable: la organización
-- existente queda `active` y sigue usando las variables de entorno del cerebro.
CREATE TABLE IF NOT EXISTS "brain_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"dispatch_url" text,
	"health_url" text,
	"key_cipher" text,
	"key_iv" text,
	"key_tag" text,
	"key_hash" text,
	"key_last4" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "brain_connection" ADD CONSTRAINT "brain_connection_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brain_connection_org_uq" ON "brain_connection" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brain_connection_key_hash_uq" ON "brain_connection" USING btree ("key_hash");
