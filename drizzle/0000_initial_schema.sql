CREATE TYPE "public"."address_kind" AS ENUM('registered', 'trading', 'branch', 'postal');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('engineer', 'technical_officer', 'director', 'administrator');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('approved', 'rejected', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('logo', 'partner_mark', 'stamp', 'signature', 'letterhead');--> statement-breakpoint
CREATE TYPE "public"."attachment_kind" AS ENUM('photo', 'video', 'voice_note', 'drawing', 'spreadsheet', 'document');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."config_state" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('quotation', 'tax_invoice', 'delivery_note', 'official_letter', 'payment_request', 'site_report', 'completion_certificate', 'purchase_order_record', 'compliance_document', 'export_invoice', 'efd_receipt');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('submission_submitted', 'submission_changes_requested', 'submission_accepted', 'submission_ready_for_documentation', 'submission_cancelled', 'project_assignment', 'config_pending_approval', 'config_approved', 'config_rejected');--> statement-breakpoint
CREATE TYPE "public"."numbering_reset" AS ENUM('never', 'yearly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planning', 'active', 'on_hold', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."rounding_mode" AS ENUM('half_up', 'half_even', 'half_down', 'floor', 'ceil');--> statement-breakpoint
CREATE TYPE "public"."rounding_step" AS ENUM('unit_price', 'line_total', 'subtotal', 'grand_total');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('draft', 'submitted', 'under_review', 'changes_requested', 'accepted', 'ready_for_documentation', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."urgency_level" AS ENUM('low', 'normal', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip_address" text,
	"successful" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"job_title" text,
	"password_hash" text NOT NULL,
	"password_changed_at" timestamp with time zone,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "app_role" NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid
);
--> statement-breakpoint
CREATE TABLE "client_vendor_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"vendor_id" text,
	"account_number" text,
	"effective_from" date,
	"effective_to" date,
	"state" "config_state" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"trading_name" text,
	"tin" text,
	"vrn" text,
	"registration_number" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"region" text,
	"postal_address" text,
	"country" text DEFAULT 'Tanzania' NOT NULL,
	"contact_person" text,
	"contact_phone" text,
	"contact_email" text,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_on_project" text,
	"is_lead" boolean DEFAULT false NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"reference" text NOT NULL,
	"description" text,
	"location" text,
	"gps_latitude" numeric(10, 7),
	"gps_longitude" numeric(10, 7),
	"status" "project_status" DEFAULT 'planning' NOT NULL,
	"start_date" date,
	"expected_completion_date" date,
	"actual_completion_date" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "engineer_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text,
	"project_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"title" text NOT NULL,
	"problem_description" text NOT NULL,
	"recommended_work" text NOT NULL,
	"urgency" "urgency_level" DEFAULT 'normal' NOT NULL,
	"site_visit_date" date,
	"gps_latitude" numeric(10, 7),
	"gps_longitude" numeric(10, 7),
	"gps_accuracy_metres" numeric(8, 2),
	"gps_captured_at" timestamp with time zone,
	"status" "submission_status" DEFAULT 'draft' NOT NULL,
	"submitted_snapshot" jsonb,
	"submitted_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"internal_review_notes" text,
	"correction_comment" text,
	"ready_for_documentation_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"kind" "attachment_kind" NOT NULL,
	"original_filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"caption" text,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "submission_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_role" "app_role",
	"action" text NOT NULL,
	"from_status" "submission_status",
	"to_status" "submission_status",
	"comment" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"label" text NOT NULL,
	"value" numeric(18, 4) NOT NULL,
	"unit" text NOT NULL,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" "document_type" NOT NULL,
	"requires_director_approval" boolean DEFAULT true NOT NULL,
	"technical_officer_may_approve" boolean DEFAULT false NOT NULL,
	"delegation_urgent_only" boolean DEFAULT true NOT NULL,
	"delegation_max_value" numeric(18, 2),
	"delegation_currency" text DEFAULT 'TZS' NOT NULL,
	"requires_signature" boolean DEFAULT false NOT NULL,
	"requires_stamp" boolean DEFAULT false NOT NULL,
	"state" "config_state" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"account_name" text NOT NULL,
	"bank_name" text NOT NULL,
	"branch" text,
	"branch_code" text,
	"account_number" text NOT NULL,
	"swift_code" text,
	"sort_code" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"state" "config_state" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"source_note" text,
	"confidence" jsonb,
	"state" "config_state" DEFAULT 'draft' NOT NULL,
	"review_comment" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charge_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"rate_percent" numeric(9, 5) NOT NULL,
	"document_type" "document_type",
	"position" integer DEFAULT 0 NOT NULL,
	"applies_before_vat" boolean DEFAULT true NOT NULL,
	"state" "config_state" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"label" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"owner_user_id" uuid,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"state" "config_state" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_table" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"from_state" "config_state",
	"to_state" "config_state" NOT NULL,
	"actor_id" uuid,
	"comment" text,
	"changed_fields" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" "address_kind" DEFAULT 'trading' NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"address_line3" text,
	"city" text,
	"region" text,
	"postal_address" text,
	"country" text DEFAULT 'Tanzania' NOT NULL,
	"phone" text,
	"alternate_phone" text,
	"whatsapp" text,
	"email" text,
	"website" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"state" "config_state" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" "document_type" NOT NULL,
	"period_key" text NOT NULL,
	"sequence" integer NOT NULL,
	"formatted" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"is_legacy_import" boolean DEFAULT false NOT NULL,
	"is_manual_override" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"issued_by" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"entity_suffix" text,
	"country_code" text DEFAULT 'TZ' NOT NULL,
	"registration_number" text,
	"tin" text,
	"vrn" text,
	"business_licence" text,
	"import_export_licence" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"state" "config_state" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "numbering_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" "document_type" NOT NULL,
	"pattern" text NOT NULL,
	"prefix" text NOT NULL,
	"sequence_padding" integer DEFAULT 4 NOT NULL,
	"sequence_start" integer DEFAULT 1 NOT NULL,
	"reset_period" "numbering_reset" DEFAULT 'yearly' NOT NULL,
	"state" "config_state" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounding_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text DEFAULT 'default' NOT NULL,
	"currency" text DEFAULT 'TZS' NOT NULL,
	"decimal_places" integer DEFAULT 2 NOT NULL,
	"mode" "rounding_mode" DEFAULT 'half_up' NOT NULL,
	"round_at_step" "rounding_step" DEFAULT 'line_total' NOT NULL,
	"state" "config_state" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"rate_percent" numeric(9, 5) NOT NULL,
	"document_type" "document_type",
	"state" "config_state" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_version" integer DEFAULT 1 NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_role" "app_role" NOT NULL,
	"under_delegation" boolean DEFAULT false NOT NULL,
	"prior_status" text,
	"new_status" text,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_role" "app_role",
	"actor_email" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"entity_type" text,
	"entity_id" uuid,
	"href" text,
	"created_by" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_profiles_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_revoked_by_profiles_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_vendor_identities" ADD CONSTRAINT "client_vendor_identities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_vendor_identities" ADD CONSTRAINT "client_vendor_identities_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_vendor_identities" ADD CONSTRAINT "client_vendor_identities_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_assigned_by_profiles_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_removed_by_profiles_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineer_submissions" ADD CONSTRAINT "engineer_submissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineer_submissions" ADD CONSTRAINT "engineer_submissions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineer_submissions" ADD CONSTRAINT "engineer_submissions_submitted_by_profiles_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineer_submissions" ADD CONSTRAINT "engineer_submissions_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_submission_id_engineer_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."engineer_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_deleted_by_profiles_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_events" ADD CONSTRAINT "submission_events_submission_id_engineer_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."engineer_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_events" ADD CONSTRAINT "submission_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_measurements" ADD CONSTRAINT "submission_measurements_submission_id_engineer_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."engineer_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_rules" ADD CONSTRAINT "charge_rules_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charge_rules" ADD CONSTRAINT "charge_rules_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_assets" ADD CONSTRAINT "company_assets_owner_user_id_profiles_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_assets" ADD CONSTRAINT "company_assets_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_assets" ADD CONSTRAINT "company_assets_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_change_log" ADD CONSTRAINT "config_change_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_addresses" ADD CONSTRAINT "entity_addresses_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_addresses" ADD CONSTRAINT "entity_addresses_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_addresses" ADD CONSTRAINT "entity_addresses_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_references" ADD CONSTRAINT "internal_references_issued_by_profiles_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_rules" ADD CONSTRAINT "numbering_rules_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbering_rules" ADD CONSTRAINT "numbering_rules_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounding_policies" ADD CONSTRAINT "rounding_policies_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounding_policies" ADD CONSTRAINT "rounding_policies_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_attempts_email_time_idx" ON "login_attempts" USING btree (lower("email"),"created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_time_idx" ON "login_attempts" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_lower_key" ON "profiles" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "profiles_active_idx" ON "profiles" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_live_key" ON "user_roles" USING btree ("user_id","role") WHERE "user_roles"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "client_vendor_identities_client_idx" ON "client_vendor_identities" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_vendor_identities_approved_key" ON "client_vendor_identities" USING btree ("client_id") WHERE "client_vendor_identities"."state" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "clients_legal_name_lower_key" ON "clients" USING btree (lower("legal_name"));--> statement-breakpoint
CREATE INDEX "clients_status_idx" ON "clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clients_tin_idx" ON "clients" USING btree ("tin");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_live_key" ON "project_members" USING btree ("project_id","user_id") WHERE "project_members"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_members_project_idx" ON "project_members" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_reference_key" ON "projects" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "engineer_submissions_reference_key" ON "engineer_submissions" USING btree ("reference") WHERE "engineer_submissions"."reference" is not null;--> statement-breakpoint
CREATE INDEX "engineer_submissions_project_idx" ON "engineer_submissions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "engineer_submissions_client_idx" ON "engineer_submissions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "engineer_submissions_author_idx" ON "engineer_submissions" USING btree ("submitted_by");--> statement-breakpoint
CREATE INDEX "engineer_submissions_status_idx" ON "engineer_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "engineer_submissions_queue_idx" ON "engineer_submissions" USING btree ("status","urgency","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_attachments_storage_key_key" ON "submission_attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "submission_attachments_submission_idx" ON "submission_attachments" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "submission_attachments_live_idx" ON "submission_attachments" USING btree ("submission_id") WHERE "submission_attachments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "submission_events_submission_idx" ON "submission_events" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE INDEX "submission_measurements_submission_idx" ON "submission_measurements" USING btree ("submission_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_policies_approved_key" ON "approval_policies" USING btree ("document_type") WHERE "approval_policies"."state" = 'approved';--> statement-breakpoint
CREATE INDEX "approval_policies_type_idx" ON "approval_policies" USING btree ("document_type","state");--> statement-breakpoint
CREATE INDEX "bank_accounts_entity_idx" ON "bank_accounts" USING btree ("legal_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_default_currency_key" ON "bank_accounts" USING btree ("legal_entity_id","currency") WHERE "bank_accounts"."is_default" = true and "bank_accounts"."state" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "brand_profiles_version_key" ON "brand_profiles" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_profiles_approved_key" ON "brand_profiles" USING btree ("state") WHERE "brand_profiles"."state" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "charge_rules_code_approved_key" ON "charge_rules" USING btree ("code") WHERE "charge_rules"."state" = 'approved';--> statement-breakpoint
CREATE INDEX "charge_rules_type_idx" ON "charge_rules" USING btree ("document_type","state");--> statement-breakpoint
CREATE UNIQUE INDEX "company_assets_storage_key_key" ON "company_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "company_assets_kind_idx" ON "company_assets" USING btree ("kind","state","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "company_assets_owner_signature_key" ON "company_assets" USING btree ("owner_user_id") WHERE "company_assets"."kind" = 'signature' and "company_assets"."state" = 'approved';--> statement-breakpoint
CREATE INDEX "config_change_log_entity_idx" ON "config_change_log" USING btree ("entity_table","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "entity_addresses_entity_idx" ON "entity_addresses" USING btree ("legal_entity_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "internal_references_formatted_key" ON "internal_references" USING btree ("formatted");--> statement-breakpoint
CREATE UNIQUE INDEX "internal_references_sequence_key" ON "internal_references" USING btree ("document_type","period_key","sequence");--> statement-breakpoint
CREATE INDEX "internal_references_entity_idx" ON "internal_references" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "legal_entities_state_idx" ON "legal_entities" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_entities_default_key" ON "legal_entities" USING btree ("country_code") WHERE "legal_entities"."is_default" = true and "legal_entities"."state" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "numbering_rules_approved_key" ON "numbering_rules" USING btree ("document_type") WHERE "numbering_rules"."state" = 'approved';--> statement-breakpoint
CREATE INDEX "numbering_rules_type_idx" ON "numbering_rules" USING btree ("document_type","state");--> statement-breakpoint
CREATE UNIQUE INDEX "rounding_policies_approved_key" ON "rounding_policies" USING btree ("scope","currency") WHERE "rounding_policies"."state" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rules_code_approved_key" ON "tax_rules" USING btree ("code") WHERE "tax_rules"."state" = 'approved';--> statement-breakpoint
CREATE INDEX "approval_decisions_subject_idx" ON "approval_decisions" USING btree ("subject_type","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "approval_decisions_actor_idx" ON "approval_decisions" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_time_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id","read_at");