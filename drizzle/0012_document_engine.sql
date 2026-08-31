CREATE TABLE "document_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"rate_percent" numeric(9, 5) NOT NULL,
	"applies_before_vat" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"amount" numeric(18, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"from_status" "document_status",
	"to_status" "document_status",
	"comment" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" "line_kind" DEFAULT 'service' NOT NULL,
	"description" text NOT NULL,
	"item_code" text,
	"quantity" numeric(18, 4) NOT NULL,
	"unit" text,
	"unit_price" numeric(18, 4) NOT NULL,
	"discount_percent" numeric(9, 5),
	"discount_amount" numeric(18, 4),
	"line_total" numeric(18, 4) NOT NULL,
	"base_unit_price" numeric(18, 4),
	"loading_factor_percent" numeric(9, 5),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_seals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_version_id" uuid NOT NULL,
	"seal_kind" text NOT NULL,
	"company_asset_id" uuid NOT NULL,
	"applied_by" uuid NOT NULL,
	"applied_by_role" text NOT NULL,
	"content_hash" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status_at_capture" "document_status" NOT NULL,
	"snapshot" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"change_summary" text,
	"pdf_storage_key" text,
	"pdf_byte_size" bigint,
	"docx_storage_key" text,
	"docx_byte_size" bigint,
	"signed_pdf_storage_key" text,
	"signed_pdf_byte_size" bigint,
	"is_approved_version" boolean DEFAULT false NOT NULL,
	"signature_applied" boolean DEFAULT false NOT NULL,
	"stamp_applied" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" "document_type" NOT NULL,
	"reference" text,
	"client_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"client_purchase_order_id" uuid,
	"source_submission_id" uuid,
	"source_document_id" uuid,
	"title" text NOT NULL,
	"scope_description" text,
	"service_period_label" text,
	"client_contact_id" uuid,
	"client_reference" text,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"legal_entity_id" uuid,
	"entity_address_id" uuid,
	"bank_account_id" uuid,
	"rounding_policy" jsonb,
	"currency" text DEFAULT 'TZS' NOT NULL,
	"tax_code" text,
	"tax_label" text,
	"tax_rate_percent" numeric(9, 5),
	"sub_total" numeric(18, 4),
	"charges_before_vat" numeric(18, 4),
	"charges_after_vat" numeric(18, 4),
	"taxable_total" numeric(18, 4),
	"tax_amount" numeric(18, 4),
	"grand_total" numeric(18, 4),
	"terms" jsonb,
	"body_content" text,
	"document_date" date,
	"filename" text,
	"prepared_by" uuid,
	"submitted_for_approval_at" timestamp with time zone,
	"submitted_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"correction_comment" text,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text
);
--> statement-breakpoint
CREATE TABLE "completion_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"client_purchase_order_id" uuid,
	"source" "completion_source" NOT NULL,
	"document_id" uuid,
	"completed_on" date NOT NULL,
	"work_description" text,
	"accepted_by_name" text,
	"accepted_by_title" text,
	"engineer_id" uuid,
	"evidence_storage_key" text,
	"evidence_filename" text,
	"evidence_content_type" text,
	"evidence_byte_size" bigint,
	"evidence_checksum_sha256" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"client_purchase_order_id" uuid,
	"document_id" uuid,
	"delivery_date" date NOT NULL,
	"location" text,
	"handover_person_id" uuid,
	"handover_person_name" text NOT NULL,
	"receiver_name" text,
	"receiver_title" text,
	"receiver_phone" text,
	"status" "delivery_status" DEFAULT 'draft' NOT NULL,
	"handover_signature_key" text,
	"handover_signed_at" timestamp with time zone,
	"receiver_signature_key" text,
	"receiver_signed_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "delivery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "delivery_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"caption" text,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "efd_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_document_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"receipt_number" text,
	"issued_on" date,
	"verification_code" text,
	"receipt_total" numeric(18, 4),
	"status" "efd_status" DEFAULT 'awaiting_receipt' NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"provider_reference" text,
	"provider_error" text,
	"receipt_storage_key" text,
	"receipt_filename" text,
	"receipt_content_type" text,
	"receipt_byte_size" bigint,
	"receipt_checksum_sha256" text,
	"notes" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compliance_record_id" uuid NOT NULL,
	"threshold_days" integer NOT NULL,
	"expires_on" date NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compliance_type_id" uuid NOT NULL,
	"reference_number" text,
	"issued_on" date,
	"expires_on" date,
	"renewal_started_on" date,
	"responsible_user_id" uuid,
	"document_storage_key" text,
	"document_filename" text,
	"document_content_type" text,
	"document_byte_size" bigint,
	"document_checksum_sha256" text,
	"notes" text,
	"superseded_at" timestamp with time zone,
	"superseded_by_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"authority" text,
	"description" text,
	"default_validity_months" integer,
	"reminder_days" text DEFAULT '90,30,14,7,1,0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"prompt_summary" text,
	"input_tokens" bigint,
	"output_tokens" bigint,
	"latency_ms" bigint,
	"succeeded" text DEFAULT 'true' NOT NULL,
	"failure_reason" text,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_training_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_kind" text NOT NULL,
	"document_type_hint" text,
	"label" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"analysis_status" "analysis_status" DEFAULT 'pending' NOT NULL,
	"analysis_result" jsonb,
	"analysis_confidence" jsonb,
	"analysis_error" text,
	"analysis_model" text,
	"analysed_at" timestamp with time zone,
	"proposed_brand_profile_id" uuid,
	"notes" text,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_message_id" uuid NOT NULL,
	"document_version_id" uuid,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_addresses" text[] NOT NULL,
	"cc_addresses" text[],
	"bcc_addresses" text[],
	"reply_to" text,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"document_id" uuid,
	"client_id" uuid,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"provider" text DEFAULT 'unconfigured' NOT NULL,
	"provider_message_id" text,
	"failure_reason" text,
	"attempt_count" bigint DEFAULT 0 NOT NULL,
	"queued_by" uuid,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "document_charges" ADD CONSTRAINT "document_charges_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_seals" ADD CONSTRAINT "document_seals_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_seals" ADD CONSTRAINT "document_seals_applied_by_profiles_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_purchase_order_id_client_purchase_orders_id_fk" FOREIGN KEY ("client_purchase_order_id") REFERENCES "public"."client_purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_submission_id_engineer_submissions_id_fk" FOREIGN KEY ("source_submission_id") REFERENCES "public"."engineer_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_legal_entity_id_legal_entities_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_entity_address_id_entity_addresses_id_fk" FOREIGN KEY ("entity_address_id") REFERENCES "public"."entity_addresses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_prepared_by_profiles_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_submitted_by_profiles_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completion_records" ADD CONSTRAINT "completion_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completion_records" ADD CONSTRAINT "completion_records_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completion_records" ADD CONSTRAINT "completion_records_client_purchase_order_id_client_purchase_orders_id_fk" FOREIGN KEY ("client_purchase_order_id") REFERENCES "public"."client_purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completion_records" ADD CONSTRAINT "completion_records_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completion_records" ADD CONSTRAINT "completion_records_engineer_id_profiles_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completion_records" ADD CONSTRAINT "completion_records_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completion_records" ADD CONSTRAINT "completion_records_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_client_purchase_order_id_client_purchase_orders_id_fk" FOREIGN KEY ("client_purchase_order_id") REFERENCES "public"."client_purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_handover_person_id_profiles_id_fk" FOREIGN KEY ("handover_person_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_photos" ADD CONSTRAINT "delivery_photos_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_photos" ADD CONSTRAINT "delivery_photos_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efd_receipts" ADD CONSTRAINT "efd_receipts_invoice_document_id_documents_id_fk" FOREIGN KEY ("invoice_document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efd_receipts" ADD CONSTRAINT "efd_receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efd_receipts" ADD CONSTRAINT "efd_receipts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efd_receipts" ADD CONSTRAINT "efd_receipts_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_compliance_record_id_compliance_records_id_fk" FOREIGN KEY ("compliance_record_id") REFERENCES "public"."compliance_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_compliance_type_id_compliance_types_id_fk" FOREIGN KEY ("compliance_type_id") REFERENCES "public"."compliance_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_responsible_user_id_profiles_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_records" ADD CONSTRAINT "compliance_records_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_types" ADD CONSTRAINT "compliance_types_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_training_assets" ADD CONSTRAINT "brand_training_assets_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_email_message_id_email_messages_id_fk" FOREIGN KEY ("email_message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_queued_by_profiles_id_fk" FOREIGN KEY ("queued_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_charges_document_idx" ON "document_charges" USING btree ("document_id","position");--> statement-breakpoint
CREATE INDEX "document_events_document_idx" ON "document_events" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "document_lines_document_idx" ON "document_lines" USING btree ("document_id","position");--> statement-breakpoint
CREATE INDEX "document_seals_version_idx" ON "document_seals" USING btree ("document_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_seals_kind_key" ON "document_seals" USING btree ("document_version_id","seal_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_number_key" ON "document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "document_versions_document_idx" ON "document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_approved_key" ON "document_versions" USING btree ("document_id") WHERE "document_versions"."is_approved_version" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_reference_key" ON "documents" USING btree ("reference") WHERE "documents"."reference" is not null;--> statement-breakpoint
CREATE INDEX "documents_client_idx" ON "documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "documents_project_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "documents_type_status_idx" ON "documents" USING btree ("document_type","status");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "documents_po_idx" ON "documents" USING btree ("client_purchase_order_id");--> statement-breakpoint
CREATE INDEX "documents_source_idx" ON "documents" USING btree ("source_document_id");--> statement-breakpoint
CREATE INDEX "documents_approval_queue_idx" ON "documents" USING btree ("submitted_for_approval_at") WHERE "documents"."status" = 'pending_approval';--> statement-breakpoint
CREATE INDEX "completion_records_project_idx" ON "completion_records" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "completion_records_evidence_key" ON "completion_records" USING btree ("evidence_storage_key") WHERE "completion_records"."evidence_storage_key" is not null;--> statement-breakpoint
CREATE INDEX "completion_records_verified_idx" ON "completion_records" USING btree ("project_id") WHERE "completion_records"."verified_at" is not null;--> statement-breakpoint
CREATE INDEX "deliveries_project_idx" ON "deliveries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "deliveries_po_idx" ON "deliveries" USING btree ("client_purchase_order_id");--> statement-breakpoint
CREATE INDEX "deliveries_status_idx" ON "deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deliveries_confirmed_idx" ON "deliveries" USING btree ("project_id") WHERE "deliveries"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "delivery_items_delivery_idx" ON "delivery_items" USING btree ("delivery_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_photos_storage_key_key" ON "delivery_photos" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "delivery_photos_delivery_idx" ON "delivery_photos" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "efd_receipts_invoice_idx" ON "efd_receipts" USING btree ("invoice_document_id");--> statement-breakpoint
CREATE INDEX "efd_receipts_status_idx" ON "efd_receipts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "efd_receipts_number_key" ON "efd_receipts" USING btree ("receipt_number") WHERE "efd_receipts"."receipt_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_alerts_once_key" ON "compliance_alerts" USING btree ("compliance_record_id","expires_on","threshold_days");--> statement-breakpoint
CREATE INDEX "compliance_alerts_record_idx" ON "compliance_alerts" USING btree ("compliance_record_id");--> statement-breakpoint
CREATE INDEX "compliance_records_type_idx" ON "compliance_records" USING btree ("compliance_type_id");--> statement-breakpoint
CREATE INDEX "compliance_records_expiry_idx" ON "compliance_records" USING btree ("expires_on");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_records_current_key" ON "compliance_records" USING btree ("compliance_type_id") WHERE "compliance_records"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_types_code_key" ON "compliance_types" USING btree ("code");--> statement-breakpoint
CREATE INDEX "ai_interactions_entity_idx" ON "ai_interactions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ai_interactions_time_idx" ON "ai_interactions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_training_assets_storage_key_key" ON "brand_training_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "brand_training_assets_kind_idx" ON "brand_training_assets" USING btree ("asset_kind","analysis_status");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_training_assets_checksum_key" ON "brand_training_assets" USING btree ("checksum_sha256") WHERE "brand_training_assets"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "email_attachments_message_idx" ON "email_attachments" USING btree ("email_message_id");--> statement-breakpoint
CREATE INDEX "email_messages_document_idx" ON "email_messages" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "email_messages_client_idx" ON "email_messages" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "email_messages_status_idx" ON "email_messages" USING btree ("status","queued_at");