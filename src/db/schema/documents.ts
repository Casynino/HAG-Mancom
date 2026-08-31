import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { profiles } from './auth'
import { clientPurchaseOrders } from './commercial'
import { bankAccounts, entityAddresses, legalEntities } from './config'
import { clients, projects } from './core'
import { documentStatusEnum, documentTypeEnum, lineKindEnum } from './enums'
import { engineerSubmissions } from './submissions'

/**
 * The Document Engine — Stages 4 and 5.
 *
 * Three ideas hold this together:
 *
 * 1. A document is only ever a draft until it is approved. Once approved it is
 *    immutable; a correction produces a new version, never an edit.
 * 2. Every figure a document shows is computed by src/lib/finance, from rates
 *    that came out of approved configuration. The rates and the rounding policy
 *    are snapshotted onto the document, so a total stays reproducible even if
 *    configuration changes afterwards.
 * 3. Every document belongs to a client and a project. There is no path to
 *    create one without both.
 */

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentType: documentTypeEnum('document_type').notNull(),

    /**
     * The internal reference. Null while the document is a draft — a number is
     * allocated when it is first submitted for approval, so abandoned drafts
     * never consume one. Allocation goes through app.issue_internal_reference().
     */
    reference: text('reference'),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),

    /** The client PO this document is raised against. Required for tax invoices. */
    clientPurchaseOrderId: uuid('client_purchase_order_id').references(
      () => clientPurchaseOrders.id,
      { onDelete: 'restrict' },
    ),

    /** The engineer submission this originated from, when it did. */
    sourceSubmissionId: uuid('source_submission_id').references(() => engineerSubmissions.id, {
      onDelete: 'set null',
    }),
    /** Quotation → invoice lineage. */
    sourceDocumentId: uuid('source_document_id'),

    title: text('title').notNull(),
    /** The SCOPE: line. A first-class field, not prose. */
    scopeDescription: text('scope_description'),
    /** The service period the scope covers, e.g. "JUNE 2026". */
    servicePeriodLabel: text('service_period_label'),

    /** Who at the client this is addressed to. */
    clientContactId: uuid('client_contact_id'),
    /** Free-text reference field the historical documents carry. */
    clientReference: text('client_reference'),

    status: documentStatusEnum('status').notNull().default('draft'),
    currentVersion: integer('current_version').notNull().default(0),

    // ---- Configuration snapshot -------------------------------------------
    // Captured when the document is priced, so the figures remain reproducible
    // after configuration moves on.
    legalEntityId: uuid('legal_entity_id').references(() => legalEntities.id, {
      onDelete: 'restrict',
    }),
    entityAddressId: uuid('entity_address_id').references(() => entityAddresses.id, {
      onDelete: 'restrict',
    }),
    bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id, {
      onDelete: 'restrict',
    }),
    /** { decimalPlaces, mode, roundAtStep } exactly as applied. */
    roundingPolicy: jsonb('rounding_policy'),

    currency: text('currency').notNull().default('TZS'),

    taxCode: text('tax_code'),
    taxLabel: text('tax_label'),
    taxRatePercent: numeric('tax_rate_percent', { precision: 9, scale: 5 }),

    // ---- Computed totals ---------------------------------------------------
    // Written only by the finance engine. Never typed by a user.
    subTotal: numeric('sub_total', { precision: 18, scale: 4 }),
    chargesBeforeVat: numeric('charges_before_vat', { precision: 18, scale: 4 }),
    chargesAfterVat: numeric('charges_after_vat', { precision: 18, scale: 4 }),
    taxableTotal: numeric('taxable_total', { precision: 18, scale: 4 }),
    taxAmount: numeric('tax_amount', { precision: 18, scale: 4 }),
    grandTotal: numeric('grand_total', { precision: 18, scale: 4 }),

    /** Payment terms, VAT statement, delivery time — the three fixed headings. */
    terms: jsonb('terms'),
    /** Body text for letters and certificates, which have no line items. */
    bodyContent: text('body_content'),

    documentDate: date('document_date'),
    /** Editable by the user before approval, per the brief. */
    filename: text('filename'),

    preparedBy: uuid('prepared_by').references(() => profiles.id, { onDelete: 'set null' }),
    submittedForApprovalAt: timestamp('submitted_for_approval_at', { withTimezone: true }),
    submittedBy: uuid('submitted_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),

    correctionComment: text('correction_comment'),
    internalNotes: text('internal_notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
  },
  (t) => [
    uniqueIndex('documents_reference_key')
      .on(t.reference)
      .where(sql`${t.reference} is not null`),
    index('documents_client_idx').on(t.clientId),
    index('documents_project_idx').on(t.projectId),
    index('documents_type_status_idx').on(t.documentType, t.status),
    index('documents_status_idx').on(t.status, t.updatedAt),
    index('documents_po_idx').on(t.clientPurchaseOrderId),
    index('documents_source_idx').on(t.sourceDocumentId),
    // Drives the Director's approval inbox.
    index('documents_approval_queue_idx')
      .on(t.submittedForApprovalAt)
      .where(sql`${t.status} = 'pending_approval'`),
  ],
)

export const documentLines = pgTable(
  'document_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    position: integer('position').notNull().default(0),
    kind: lineKindEnum('kind').notNull().default('service'),

    description: text('description').notNull(),
    itemCode: text('item_code'),

    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unit: text('unit'),
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),

    discountPercent: numeric('discount_percent', { precision: 9, scale: 5 }),
    discountAmount: numeric('discount_amount', { precision: 18, scale: 4 }),
    /** quantity × unit price, less discount. Computed, never typed. */
    lineTotal: numeric('line_total', { precision: 18, scale: 4 }).notNull(),

    /**
     * When this line came from folding a quotation's charges into the price,
     * the original figures are kept so the derivation stays auditable.
     */
    baseUnitPrice: numeric('base_unit_price', { precision: 18, scale: 4 }),
    loadingFactorPercent: numeric('loading_factor_percent', { precision: 9, scale: 5 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('document_lines_document_idx').on(t.documentId, t.position)],
)

/** The charges actually applied, snapshotted with their rates. */
export const documentCharges = pgTable(
  'document_charges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    code: text('code').notNull(),
    label: text('label').notNull(),
    ratePercent: numeric('rate_percent', { precision: 9, scale: 5 }).notNull(),
    appliesBeforeVat: boolean('applies_before_vat').notNull().default(true),
    position: integer('position').notNull().default(0),
    amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  },
  (t) => [index('document_charges_document_idx').on(t.documentId, t.position)],
)

/**
 * An immutable snapshot of a document at a point in its life.
 *
 * A version is written when the document is submitted for approval and again
 * when it is approved. `contentHash` is a SHA-256 over the canonical snapshot:
 * it is what an approval signs, and it is what proves later that the approved
 * document is byte-for-byte the one that was reviewed.
 *
 * The unsigned rendering is kept alongside the signed one, as the brief
 * requires — approving must never destroy the document as it stood before.
 */
export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    version: integer('version').notNull(),
    statusAtCapture: documentStatusEnum('status_at_capture').notNull(),

    /** Full content: header, lines, charges, totals, terms, config snapshot. */
    snapshot: jsonb('snapshot').notNull(),
    contentHash: text('content_hash').notNull(),
    changeSummary: text('change_summary'),

    /** Rendering without signature or stamp. Always preserved. */
    pdfStorageKey: text('pdf_storage_key'),
    pdfByteSize: bigint('pdf_byte_size', { mode: 'number' }),
    docxStorageKey: text('docx_storage_key'),
    docxByteSize: bigint('docx_byte_size', { mode: 'number' }),

    /** Rendering with signature and/or stamp applied. Written only on approval. */
    signedPdfStorageKey: text('signed_pdf_storage_key'),
    signedPdfByteSize: bigint('signed_pdf_byte_size', { mode: 'number' }),

    isApprovedVersion: boolean('is_approved_version').notNull().default(false),
    signatureApplied: boolean('signature_applied').notNull().default(false),
    stampApplied: boolean('stamp_applied').notNull().default(false),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('document_versions_number_key').on(t.documentId, t.version),
    index('document_versions_document_idx').on(t.documentId, t.version),
    uniqueIndex('document_versions_approved_key')
      .on(t.documentId)
      .where(sql`${t.isApprovedVersion} = true`),
  ],
)

/**
 * A record that a signature or the company stamp was applied.
 *
 * Separate from the version so the act is auditable in its own right: who
 * applied which asset, to which version, at what moment, against which hash.
 * The brief is explicit that placing an image is not enough.
 */
export const documentSeals = pgTable(
  'document_seals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentVersionId: uuid('document_version_id')
      .notNull()
      .references(() => documentVersions.id, { onDelete: 'cascade' }),

    /** 'signature' or 'stamp'. */
    sealKind: text('seal_kind').notNull(),
    companyAssetId: uuid('company_asset_id').notNull(),

    appliedBy: uuid('applied_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    /** The role exercised. Snapshotted — a later role change must not rewrite this. */
    appliedByRole: text('applied_by_role').notNull(),
    /** The content hash at the moment of sealing. */
    contentHash: text('content_hash').notNull(),

    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('document_seals_version_idx').on(t.documentVersionId),
    uniqueIndex('document_seals_kind_key').on(t.documentVersionId, t.sealKind),
  ],
)

/** Workflow ledger for a document, mirroring submission_events. */
export const documentEvents = pgTable(
  'document_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorRole: text('actor_role'),
    action: text('action').notNull(),
    fromStatus: documentStatusEnum('from_status'),
    toStatus: documentStatusEnum('to_status'),
    comment: text('comment'),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('document_events_document_idx').on(t.documentId, t.createdAt)],
)

export const documentsRelations = relations(documents, ({ one, many }) => ({
  client: one(clients, { fields: [documents.clientId], references: [clients.id] }),
  project: one(projects, { fields: [documents.projectId], references: [projects.id] }),
  purchaseOrder: one(clientPurchaseOrders, {
    fields: [documents.clientPurchaseOrderId],
    references: [clientPurchaseOrders.id],
  }),
  lines: many(documentLines),
  charges: many(documentCharges),
  versions: many(documentVersions),
  events: many(documentEvents),
}))

export const documentLinesRelations = relations(documentLines, ({ one }) => ({
  document: one(documents, { fields: [documentLines.documentId], references: [documents.id] }),
}))

export const documentVersionsRelations = relations(documentVersions, ({ one, many }) => ({
  document: one(documents, { fields: [documentVersions.documentId], references: [documents.id] }),
  seals: many(documentSeals),
}))
