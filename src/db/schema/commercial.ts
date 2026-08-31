import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { profiles } from './auth'
import { clients, projects } from './core'
import { poStatusEnum } from './enums'

/**
 * Client-side commercial records — Stage 2.
 *
 * The governing rule for this module: a client Purchase Order number is created
 * by the client, in the client's own system. HA GROUP receives it. There is no
 * code path anywhere in this platform that generates one, and the column has no
 * default, no sequence and no trigger — it can only ever be typed in or pasted
 * from the document the client sent.
 */

/**
 * People at the client. Separate from the single contact fields on `clients`
 * because a project usually has a site contact, a procurement contact and a
 * finance contact, and invoices go to a different person from site reports.
 */
export const clientContacts = pgTable(
  'client_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    fullName: text('full_name').notNull(),
    jobTitle: text('job_title'),
    department: text('department'),
    phone: text('phone'),
    alternatePhone: text('alternate_phone'),
    email: text('email'),

    /** The default recipient for documents when no other contact is chosen. */
    isPrimary: boolean('is_primary').notNull().default(false),
    /** Receives quotations and invoices. */
    receivesDocuments: boolean('receives_documents').notNull().default(false),

    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Archived rather than deleted: past documents name this person. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    index('client_contacts_client_idx').on(t.clientId),
    uniqueIndex('client_contacts_primary_key')
      .on(t.clientId)
      .where(sql`${t.isPrimary} = true and ${t.archivedAt} is null`),
  ],
)

/**
 * A Purchase Order the client issued to HA GROUP.
 *
 * `poNumber` is external. Phase 0 observed the form `PO_4500848755` on every
 * sample invoice — a SAP-style ten-digit number beginning 45 — but the platform
 * does not enforce that shape, because a different client will use a different
 * one. It validates that a number was supplied and that it is not a duplicate
 * for that client, and nothing more.
 */
export const clientPurchaseOrders = pgTable(
  'client_purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),

    /** EXTERNAL. Supplied by the client. Never generated. */
    poNumber: text('po_number').notNull(),
    poDate: date('po_date'),
    receivedAt: timestamp('received_at', { withTimezone: true }),

    description: text('description'),
    currency: text('currency').notNull().default('TZS'),
    /** Order value as stated on the client's PO, for reconciliation. */
    orderValue: numeric('order_value', { precision: 18, scale: 2 }),

    status: poStatusEnum('status').notNull().default('open'),

    /** The client's own PO document, stored exactly as received. */
    documentStorageKey: text('document_storage_key'),
    documentFilename: text('document_filename'),
    documentContentType: text('document_content_type'),
    documentByteSize: bigint('document_byte_size', { mode: 'number' }),
    documentChecksumSha256: text('document_checksum_sha256'),

    notes: text('notes'),

    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
  },
  (t) => [
    // One PO number per client. Two clients may legitimately use the same
    // number in their own systems, so uniqueness is scoped to the client.
    uniqueIndex('client_purchase_orders_number_key').on(t.clientId, t.poNumber),
    index('client_purchase_orders_project_idx').on(t.projectId),
    index('client_purchase_orders_status_idx').on(t.status),
    uniqueIndex('client_purchase_orders_document_key')
      .on(t.documentStorageKey)
      .where(sql`${t.documentStorageKey} is not null`),
  ],
)

export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  client: one(clients, { fields: [clientContacts.clientId], references: [clients.id] }),
}))

export const clientPurchaseOrdersRelations = relations(clientPurchaseOrders, ({ one }) => ({
  client: one(clients, { fields: [clientPurchaseOrders.clientId], references: [clients.id] }),
  project: one(projects, { fields: [clientPurchaseOrders.projectId], references: [projects.id] }),
}))
