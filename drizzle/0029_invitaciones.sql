-- 068: invitaciones para que un cliente registre su negocio. Aditiva y
-- re-ejecutable. Token y código de verificación solo como hash.
CREATE TABLE IF NOT EXISTS "business_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"note" text,
	"created_by" text,
	"business_name" text,
	"email" text,
	"code_hash" text,
	"code_expires_at" timestamp,
	"verified_at" timestamp,
	"used_at" timestamp,
	"organization_id" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "business_invitation" ADD CONSTRAINT "business_invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "business_invitation_created_idx" ON "business_invitation" USING btree ("created_at");
