import { pgEnum } from 'drizzle-orm/pg-core'

/**
 * Application roles. Authorisation is driven by these values in the database,
 * never by anything the client sends.
 */
export const appRoleEnum = pgEnum('app_role', [
  'engineer',
  'technical_officer',
  'director',
  'administrator',
])

/**
 * Engineer submission lifecycle. Transitions are constrained by a database
 * trigger (see the workflow migration) as well as in application code, so an
 * invalid move fails even if it is attempted outside the app.
 */
export const submissionStatusEnum = pgEnum('submission_status', [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'accepted',
  'ready_for_documentation',
  'cancelled',
])

export const urgencyEnum = pgEnum('urgency_level', ['low', 'normal', 'high', 'critical'])

export const clientStatusEnum = pgEnum('client_status', ['active', 'inactive', 'archived'])

export const projectStatusEnum = pgEnum('project_status', [
  'planning',
  'active',
  'on_hold',
  'completed',
  'archived',
])

export const attachmentKindEnum = pgEnum('attachment_kind', [
  'photo',
  'video',
  'voice_note',
  'drawing',
  'spreadsheet',
  'document',
])

/**
 * Every configuration record carries its own lifecycle. Values extracted from
 * historical documents land as `draft` and are inert until an Administrator
 * approves them — nothing is auto-activated.
 */
export const configStateEnum = pgEnum('config_state', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'superseded',
])

export const approvalDecisionEnum = pgEnum('approval_decision', [
  'approved',
  'rejected',
  'changes_requested',
])

/**
 * Document types the platform will issue or record. Approval policy, numbering
 * rules and charge rules are all keyed on this, so adding a future document
 * type is a configuration change rather than a code change.
 */
export const documentTypeEnum = pgEnum('document_type', [
  'quotation',
  'tax_invoice',
  'delivery_note',
  'official_letter',
  'payment_request',
  'site_report',
  'completion_certificate',
  'purchase_order_record',
  'compliance_document',
  'export_invoice',
  'efd_receipt',
])

export const addressKindEnum = pgEnum('address_kind', ['registered', 'trading', 'branch', 'postal'])

export const assetKindEnum = pgEnum('asset_kind', [
  'logo',
  'partner_mark',
  'stamp',
  'signature',
  'letterhead',
])

/**
 * Rounding is a stated policy, not an accident of the runtime. Phase 0 found a
 * TZS 0.05 drift between a quotation and its invoice caused by rounding at the
 * unit-price step, so where and how rounding happens is configuration.
 */
export const roundingModeEnum = pgEnum('rounding_mode', [
  'half_up',
  'half_even',
  'half_down',
  'floor',
  'ceil',
])

export const roundingStepEnum = pgEnum('rounding_step', [
  'unit_price',
  'line_total',
  'subtotal',
  'grand_total',
])

export const numberingResetEnum = pgEnum('numbering_reset', ['never', 'yearly', 'monthly'])

export const notificationKindEnum = pgEnum('notification_kind', [
  'submission_submitted',
  'submission_changes_requested',
  'submission_accepted',
  'submission_ready_for_documentation',
  'submission_cancelled',
  'project_assignment',
  'config_pending_approval',
  'config_approved',
  'config_rejected',
  'document_pending_approval',
  'document_approved',
  'document_rejected',
  'document_changes_requested',
  'document_issued',
  'delivery_awaiting_signature',
  'delivery_confirmed',
  'compliance_expiring',
  'compliance_expired',
  'efd_receipt_required',
])

/* ---------------------------------------------------------------------------
 * Stage 2 onward
 * ------------------------------------------------------------------------ */

/** Lifecycle of a client Purchase Order as HA GROUP works against it. */
export const poStatusEnum = pgEnum('po_status', [
  'open',
  'partially_fulfilled',
  'fulfilled',
  'closed',
  'cancelled',
])

/**
 * Document lifecycle. Mirrors the submission machine in shape but is stricter
 * after approval: an approved document is immutable, and a correction produces
 * a new version rather than an edit.
 */
export const documentStatusEnum = pgEnum('document_status', [
  'draft',
  'pending_review',
  'pending_approval',
  'changes_requested',
  'approved',
  'rejected',
  'issued',
  'archived',
  'cancelled',
])

/** What a line on a priced document represents. Drives cost reporting later. */
export const lineKindEnum = pgEnum('line_kind', [
  'material',
  'labour',
  'equipment',
  'service',
  'transport',
  'other',
])

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'draft',
  'pending_signatures',
  'confirmed',
  'cancelled',
])

/**
 * Where completion evidence came from. HA GROUP issues its own certificate;
 * clients often return their own acceptance form signed by the engineer.
 */
export const completionSourceEnum = pgEnum('completion_source', [
  'ha_group_certificate',
  'client_acceptance',
])

/**
 * EFD receipt state. `not_integrated` is the honest default: until an approved
 * TRA integration and credentials exist, the platform records the receipt a
 * human obtained rather than pretending to have issued one.
 */
export const efdStatusEnum = pgEnum('efd_status', [
  'not_required',
  'awaiting_receipt',
  'recorded',
  'failed',
])

export const emailStatusEnum = pgEnum('email_status', [
  'queued',
  'sent',
  'delivered',
  'failed',
  'bounced',
])

/** Result of running document analysis over an uploaded training asset. */
export const analysisStatusEnum = pgEnum('analysis_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
])
