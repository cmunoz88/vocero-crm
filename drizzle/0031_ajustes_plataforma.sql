-- 068 · etapa 4: ajustes de la plataforma (los modelos autorizados por el
-- superadministrador). Sin organization_id a propósito: es de la plataforma,
-- no de un negocio. Aditiva y re-ejecutable.
CREATE TABLE IF NOT EXISTS "platform_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
