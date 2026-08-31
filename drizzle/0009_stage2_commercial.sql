CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."completion_source" AS ENUM('ha_group_certificate', 'client_acceptance');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('draft', 'pending_signatures', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('draft', 'pending_review', 'pending_approval', 'changes_requested', 'approved', 'rejected', 'issued', 'archived', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."efd_status" AS ENUM('not_required', 'awaiting_receipt', 'recorded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'delivered', 'failed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."line_kind" AS ENUM('material', 'labour', 'equipment', 'service', 'transport', 'other');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('open', 'partially_fulfilled', 'fulfilled', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"job_title" text,
	"department" text,
	"phone" text,
	"alternate_phone" text,
	"email" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"receives_documents" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "client_purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"po_number" text NOT NULL,
	"po_date" date,
	"received_at" timestamp with time zone,
	"description" text,
	"currency" text DEFAULT 'TZS' NOT NULL,
	"order_value" numeric(18, 2),
	"status" "po_status" DEFAULT 'open' NOT NULL,
	"document_storage_key" text,
	"document_filename" text,
	"document_content_type" text,
	"document_byte_size" bigint,
	"document_checksum_sha256" text,
	"notes" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text
);
--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_purchase_orders" ADD CONSTRAINT "client_purchase_orders_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_contacts_primary_key" ON "client_contacts" USING btree ("client_id") WHERE "client_contacts"."is_primary" = true and "client_contacts"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "client_purchase_orders_number_key" ON "client_purchase_orders" USING btree ("client_id","po_number");--> statement-breakpoint
CREATE INDEX "client_purchase_orders_project_idx" ON "client_purchase_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "client_purchase_orders_status_idx" ON "client_purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "client_purchase_orders_document_key" ON "client_purchase_orders" USING btree ("document_storage_key") WHERE "client_purchase_orders"."document_storage_key" is not null;