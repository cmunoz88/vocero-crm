-- 069: cumplimiento con Meta. Quién autorizó cada conexión (`meta_user_id`) y
-- el registro de solicitudes de eliminación de datos. Aditiva y re-ejecutable.
CREATE TABLE IF NOT EXISTS "meta_data_deletion" (
	"id" text PRIMARY KEY NOT NULL,
	"confirmation_code" text NOT NULL,
	"meta_user_id" text NOT NULL,
	"status" text NOT NULL,
	"numbers_removed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meta_data_deletion_confirmation_code_unique" UNIQUE("confirmation_code")
);
--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN IF NOT EXISTS "meta_user_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_data_deletion_user_idx" ON "meta_data_deletion" USING btree ("meta_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_credentials_meta_user_idx" ON "meta_credentials" USING btree ("meta_user_id");
