import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { profiles } from './auth'

/**
 * Compliance — Stage 8.
 *
 * Status is never stored. "Expiring soon" is a function of today's date and the
 * expiry date, so storing it would guarantee it goes stale the moment nobody
 * runs a job. `app.compliance_status()` computes it on read, and the reminder
 * ledger below exists only to stop the same alert being sent twice.
 */

/**
 * The kinds of certificate HA GROUP holds. A table, not an enum, because the
 * brief calls for "other configurable requirements" — a new regulator should be
 * a row an Administrator adds, not a migration.
 */
export const complianceTypes = pgTable(
  'compliance_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    /** The body that issues it, e.g. TRA, BRELA, OSHA, WCF, NSSF. */
    authority: text('authority'),
    description: text('description'),

    /** Used to propose an expiry date when a new record is entered. */
    defaultValidityMonths: integer('default_validity_months'),
    /** Days before expiry at which to warn. Defaults follow the brief. */
    reminderDays: text('reminder_days').notNull().default('90,30,14,7,1,0'),

    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('compliance_types_code_key').on(t.code)],
)

export const complianceRecords = pgTable(
  'compliance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    complianceTypeId: uuid('compliance_type_id')
      .notNull()
      .references(() => complianceTypes.id, { onDelete: 'restrict' }),

    referenceNumber: text('reference_number'),
    issuedOn: date('issued_on'),
    expiresOn: date('expires_on'),
    /** Set when a renewal is under way, so the record reads as in-hand. */
    renewalStartedOn: date('renewal_started_on'),

    responsibleUserId: uuid('responsible_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),

    /** The certificate itself. */
    documentStorageKey: text('document_storage_key'),
    documentFilename: text('document_filename'),
    documentContentType: text('document_content_type'),
    documentByteSize: bigint('document_byte_size', { mode: 'number' }),
    documentChecksumSha256: text('document_checksum_sha256'),

    notes: text('notes'),
    /** Superseded records are kept: proving cover on a past date matters. */
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    supersededById: uuid('superseded_by_id'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('compliance_records_type_idx').on(t.complianceTypeId),
    index('compliance_records_expiry_idx').on(t.expiresOn),
    // One live record per certificate type.
    uniqueIndex('compliance_records_current_key')
      .on(t.complianceTypeId)
      .where(sql`${t.supersededAt} is null`),
  ],
)

/**
 * Which reminders have already gone out.
 *
 * Without this, a daily sweep would re-notify every day past each threshold.
 * The unique index is what makes the sweep idempotent.
 */
export const complianceAlerts = pgTable(
  'compliance_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    complianceRecordId: uuid('compliance_record_id')
      .notNull()
      .references(() => complianceRecords.id, { onDelete: 'cascade' }),

    /** Days before expiry this alert represents. Negative means overdue. */
    thresholdDays: integer('threshold_days').notNull(),
    /** The expiry the alert was raised against — a renewal resets the series. */
    expiresOn: date('expires_on').notNull(),

    notifiedAt: timestamp('notified_at', { withTimezone: true }).notNull().defaultNow(),
    recipientCount: integer('recipient_count').notNull().default(0),
  },
  (t) => [
    uniqueIndex('compliance_alerts_once_key').on(
      t.complianceRecordId,
      t.expiresOn,
      t.thresholdDays,
    ),
    index('compliance_alerts_record_idx').on(t.complianceRecordId),
  ],
)

export const complianceRecordsRelations = relations(complianceRecords, ({ one, many }) => ({
  type: one(complianceTypes, {
    fields: [complianceRecords.complianceTypeId],
    references: [complianceTypes.id],
  }),
  alerts: many(complianceAlerts),
}))
