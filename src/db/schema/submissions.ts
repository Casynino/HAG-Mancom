import { relations, sql } from 'drizzle-orm'
import {
  bigint,
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
import { clients, projects } from './core'
import { appRoleEnum, attachmentKindEnum, submissionStatusEnum, urgencyEnum } from './enums'

/**
 * What an Engineer files from site. The principle from the brief is that the
 * Engineer supplies information rather than writing a report, so the fields are
 * short and structured; measurements and attachments carry the detail.
 */
export const engineerSubmissions = pgTable(
  'engineer_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Issued from the internal reference sequence at submission time, not at draft time. */
    reference: text('reference'),

    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    /**
     * Denormalised from the project at creation. Kept so that a submission
     * remains attributable if a Technical Officer later corrects the project
     * link, and so RLS can filter without a join.
     */
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),

    submittedBy: uuid('submitted_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),

    title: text('title').notNull(),
    problemDescription: text('problem_description').notNull(),
    recommendedWork: text('recommended_work').notNull(),
    urgency: urgencyEnum('urgency').notNull().default('normal'),

    siteVisitDate: date('site_visit_date'),
    gpsLatitude: numeric('gps_latitude', { precision: 10, scale: 7 }),
    gpsLongitude: numeric('gps_longitude', { precision: 10, scale: 7 }),
    gpsAccuracyMetres: numeric('gps_accuracy_metres', { precision: 8, scale: 2 }),
    gpsCapturedAt: timestamp('gps_captured_at', { withTimezone: true }),

    status: submissionStatusEnum('status').notNull().default('draft'),

    /**
     * Immutable copy of the submission as it stood the moment the Engineer
     * submitted it, including measurements and the attachment manifest. The
     * live rows may later be corrected; this records what was actually filed.
     */
    submittedSnapshot: jsonb('submitted_snapshot'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),

    /** Increments each time the Engineer resubmits after a correction request. */
    revision: integer('revision').notNull().default(1),

    reviewedBy: uuid('reviewed_by').references(() => profiles.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    /** Technical Officer's internal notes. Never shown to the Engineer. */
    internalReviewNotes: text('internal_review_notes'),
    /** The comment returned to the Engineer with a correction request. */
    correctionComment: text('correction_comment'),

    readyForDocumentationAt: timestamp('ready_for_documentation_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('engineer_submissions_reference_key')
      .on(t.reference)
      .where(sql`${t.reference} is not null`),
    index('engineer_submissions_project_idx').on(t.projectId),
    index('engineer_submissions_client_idx').on(t.clientId),
    index('engineer_submissions_author_idx').on(t.submittedBy),
    index('engineer_submissions_status_idx').on(t.status),
    // Drives the Technical Officer review queue: pending work, most urgent first.
    index('engineer_submissions_queue_idx').on(t.status, t.urgency, t.submittedAt),
  ],
)

/**
 * Structured measurements. Held as rows rather than free text so they can be
 * carried into a quotation without re-keying, and so units are never ambiguous.
 */
export const submissionMeasurements = pgTable(
  'submission_measurements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => engineerSubmissions.id, { onDelete: 'cascade' }),

    label: text('label').notNull(),
    value: numeric('value', { precision: 18, scale: 4 }).notNull(),
    unit: text('unit').notNull(),
    notes: text('notes'),
    position: integer('position').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('submission_measurements_submission_idx').on(t.submissionId, t.position)],
)

/**
 * Uploaded evidence. The original bytes are never modified — `storageKey` points
 * at immutable object storage and the checksum lets us prove it.
 */
export const submissionAttachments = pgTable(
  'submission_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => engineerSubmissions.id, { onDelete: 'cascade' }),

    kind: attachmentKindEnum('kind').notNull(),
    originalFilename: text('original_filename').notNull(),
    /** Opaque storage key. Never derived from user input. */
    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    checksumSha256: text('checksum_sha256').notNull(),

    caption: text('caption'),

    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete only, and only while the submission is still a draft. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: uuid('deleted_by').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('submission_attachments_storage_key_key').on(t.storageKey),
    index('submission_attachments_submission_idx').on(t.submissionId),
    index('submission_attachments_live_idx')
      .on(t.submissionId)
      .where(sql`${t.deletedAt} is null`),
  ],
)

/**
 * Workflow ledger for a single submission. This is the human-readable history
 * shown on the record; the global audit_log remains the system-wide trail.
 */
export const submissionEvents = pgTable(
  'submission_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => engineerSubmissions.id, { onDelete: 'cascade' }),

    actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorRole: appRoleEnum('actor_role'),

    action: text('action').notNull(),
    fromStatus: submissionStatusEnum('from_status'),
    toStatus: submissionStatusEnum('to_status'),
    comment: text('comment'),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('submission_events_submission_idx').on(t.submissionId, t.createdAt)],
)

export const engineerSubmissionsRelations = relations(engineerSubmissions, ({ one, many }) => ({
  project: one(projects, { fields: [engineerSubmissions.projectId], references: [projects.id] }),
  client: one(clients, { fields: [engineerSubmissions.clientId], references: [clients.id] }),
  author: one(profiles, { fields: [engineerSubmissions.submittedBy], references: [profiles.id] }),
  measurements: many(submissionMeasurements),
  attachments: many(submissionAttachments),
  events: many(submissionEvents),
}))

export const submissionMeasurementsRelations = relations(submissionMeasurements, ({ one }) => ({
  submission: one(engineerSubmissions, {
    fields: [submissionMeasurements.submissionId],
    references: [engineerSubmissions.id],
  }),
}))

export const submissionAttachmentsRelations = relations(submissionAttachments, ({ one }) => ({
  submission: one(engineerSubmissions, {
    fields: [submissionAttachments.submissionId],
    references: [engineerSubmissions.id],
  }),
}))

export const submissionEventsRelations = relations(submissionEvents, ({ one }) => ({
  submission: one(engineerSubmissions, {
    fields: [submissionEvents.submissionId],
    references: [engineerSubmissions.id],
  }),
}))
