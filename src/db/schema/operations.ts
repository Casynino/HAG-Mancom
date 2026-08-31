import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { profiles } from './auth'
import { clientPurchaseOrders } from './commercial'
import { clients, projects } from './core'
import { documents } from './documents'
import { completionSourceEnum, deliveryStatusEnum, efdStatusEnum } from './enums'

/**
 * Delivery, completion and EFD — the evidence that gates invoicing.
 *
 * The brief's rule is that a tax invoice may not be issued until there is a
 * signed delivery note or signed completion evidence. These tables hold that
 * evidence, and `app.invoice_readiness()` reads them.
 */

export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    clientPurchaseOrderId: uuid('client_purchase_order_id').references(
      () => clientPurchaseOrders.id,
      { onDelete: 'restrict' },
    ),
    /** The Delivery Note document this delivery is recorded on. */
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    deliveryDate: date('delivery_date').notNull(),
    location: text('location'),

    /** Who handed over, on HA GROUP's side. */
    handoverPersonId: uuid('handover_person_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    handoverPersonName: text('handover_person_name').notNull(),

    /** Who received, on the client's side. Not a platform user. */
    receiverName: text('receiver_name'),
    receiverTitle: text('receiver_title'),
    receiverPhone: text('receiver_phone'),

    status: deliveryStatusEnum('status').notNull().default('draft'),

    /**
     * Captured signatures, stored as images. These are handwritten marks taken
     * on a phone at the point of handover — distinct from the Director's
     * official signature asset, which lives in company_assets and can only be
     * applied by a Director.
     */
    handoverSignatureKey: text('handover_signature_key'),
    handoverSignedAt: timestamp('handover_signed_at', { withTimezone: true }),
    receiverSignatureKey: text('receiver_signature_key'),
    receiverSignedAt: timestamp('receiver_signed_at', { withTimezone: true }),

    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    index('deliveries_project_idx').on(t.projectId),
    index('deliveries_po_idx').on(t.clientPurchaseOrderId),
    index('deliveries_status_idx').on(t.status),
    // The gate invoice readiness reads.
    index('deliveries_confirmed_idx')
      .on(t.projectId)
      .where(sql`${t.status} = 'confirmed'`),
  ],
)

export const deliveryItems = pgTable(
  'delivery_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => deliveries.id, { onDelete: 'cascade' }),

    position: integer('position').notNull().default(0),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unit: text('unit'),
    notes: text('notes'),
  },
  (t) => [index('delivery_items_delivery_idx').on(t.deliveryId, t.position)],
)

/** Proof-of-delivery photographs. */
export const deliveryPhotos = pgTable(
  'delivery_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => deliveries.id, { onDelete: 'cascade' }),

    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    checksumSha256: text('checksum_sha256').notNull(),
    caption: text('caption'),

    uploadedBy: uuid('uploaded_by').references(() => profiles.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('delivery_photos_storage_key_key').on(t.storageKey),
    index('delivery_photos_delivery_idx').on(t.deliveryId),
  ],
)

/**
 * Evidence that work was completed.
 *
 * Two shapes, because HA GROUP encounters both: a Completion Certificate the
 * platform issues, and a client's own acceptance form returned signed by the
 * HA GROUP engineer. The second is an uploaded original — the platform stores
 * it, links it to the project, and never alters it.
 */
export const completionRecords = pgTable(
  'completion_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    clientPurchaseOrderId: uuid('client_purchase_order_id').references(
      () => clientPurchaseOrders.id,
      { onDelete: 'set null' },
    ),

    source: completionSourceEnum('source').notNull(),
    /** Set when source is a Completion Certificate this platform issued. */
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),

    completedOn: date('completed_on').notNull(),
    workDescription: text('work_description'),

    /** Who at the client accepted the work. */
    acceptedByName: text('accepted_by_name'),
    acceptedByTitle: text('accepted_by_title'),
    /** The HA GROUP engineer who signed the client's form. */
    engineerId: uuid('engineer_id').references(() => profiles.id, { onDelete: 'set null' }),

    /** The client's original signed acceptance document, stored as received. */
    evidenceStorageKey: text('evidence_storage_key'),
    evidenceFilename: text('evidence_filename'),
    evidenceContentType: text('evidence_content_type'),
    evidenceByteSize: bigint('evidence_byte_size', { mode: 'number' }),
    evidenceChecksumSha256: text('evidence_checksum_sha256'),

    /** A Technical Officer confirms the evidence is genuine and complete. */
    verifiedBy: uuid('verified_by').references(() => profiles.id, { onDelete: 'set null' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),

    notes: text('notes'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('completion_records_project_idx').on(t.projectId),
    uniqueIndex('completion_records_evidence_key')
      .on(t.evidenceStorageKey)
      .where(sql`${t.evidenceStorageKey} is not null`),
    index('completion_records_verified_idx')
      .on(t.projectId)
      .where(sql`${t.verifiedAt} is not null`),
  ],
)

/**
 * EFD receipts.
 *
 * The platform does NOT issue these. A TRA electronic fiscal receipt comes from
 * TRA, through a certified device or an approved integration, and HA GROUP has
 * neither configured here. What this table does is record the receipt a person
 * obtained: its number, its date, and the official file.
 *
 * `provider` exists so a real TRA integration can be added later without
 * reshaping the finance module — see src/lib/efd/. Until one is approved and
 * credentialled, every row is `manual`.
 */
export const efdReceipts = pgTable(
  'efd_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The tax invoice this receipt belongs to. */
    invoiceDocumentId: uuid('invoice_document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),

    /** The receipt number TRA issued. External — never generated here. */
    receiptNumber: text('receipt_number'),
    issuedOn: date('issued_on'),
    /** Verification code / QR payload printed on the receipt, where present. */
    verificationCode: text('verification_code'),
    receiptTotal: numeric('receipt_total', { precision: 18, scale: 4 }),

    status: efdStatusEnum('status').notNull().default('awaiting_receipt'),

    /** 'manual' until an approved TRA integration exists. */
    provider: text('provider').notNull().default('manual'),
    providerReference: text('provider_reference'),
    providerError: text('provider_error'),

    /** The official receipt file, as issued. */
    receiptStorageKey: text('receipt_storage_key'),
    receiptFilename: text('receipt_filename'),
    receiptContentType: text('receipt_content_type'),
    receiptByteSize: bigint('receipt_byte_size', { mode: 'number' }),
    receiptChecksumSha256: text('receipt_checksum_sha256'),

    notes: text('notes'),
    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('efd_receipts_invoice_idx').on(t.invoiceDocumentId),
    index('efd_receipts_status_idx').on(t.status),
    // A receipt number, once known, identifies exactly one receipt.
    uniqueIndex('efd_receipts_number_key')
      .on(t.receiptNumber)
      .where(sql`${t.receiptNumber} is not null`),
  ],
)

export const deliveriesRelations = relations(deliveries, ({ one, many }) => ({
  project: one(projects, { fields: [deliveries.projectId], references: [projects.id] }),
  client: one(clients, { fields: [deliveries.clientId], references: [clients.id] }),
  items: many(deliveryItems),
  photos: many(deliveryPhotos),
}))

export const completionRecordsRelations = relations(completionRecords, ({ one }) => ({
  project: one(projects, { fields: [completionRecords.projectId], references: [projects.id] }),
}))

export const efdReceiptsRelations = relations(efdReceipts, ({ one }) => ({
  invoice: one(documents, {
    fields: [efdReceipts.invoiceDocumentId],
    references: [documents.id],
  }),
}))
