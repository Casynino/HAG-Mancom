import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { profiles } from './auth'
import { clients } from './core'
import { documents, documentVersions } from './documents'
import { analysisStatusEnum, emailStatusEnum } from './enums'

/**
 * Outbound email — Stage 7.
 *
 * Every message HA GROUP sends from the platform is recorded here before it is
 * sent, so the log is the source of truth rather than a side effect of a
 * provider webhook. Credentials never appear in this table or anywhere the
 * client can reach; the provider is configured through environment variables
 * and used only in `src/lib/email/`.
 */
export const emailMessages = pgTable(
  'email_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Recipients, stored as arrays so a message to several people is one row. */
    toAddresses: text('to_addresses').array().notNull(),
    ccAddresses: text('cc_addresses').array(),
    bccAddresses: text('bcc_addresses').array(),
    replyTo: text('reply_to'),

    subject: text('subject').notNull(),
    bodyText: text('body_text').notNull(),

    /** What this email is about, so it appears on the client and project. */
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),

    status: emailStatusEnum('status').notNull().default('queued'),
    provider: text('provider').notNull().default('unconfigured'),
    providerMessageId: text('provider_message_id'),
    failureReason: text('failure_reason'),
    attemptCount: bigint('attempt_count', { mode: 'number' }).notNull().default(0),

    queuedBy: uuid('queued_by').references(() => profiles.id, { onDelete: 'set null' }),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  },
  (t) => [
    index('email_messages_document_idx').on(t.documentId),
    index('email_messages_client_idx').on(t.clientId),
    index('email_messages_status_idx').on(t.status, t.queuedAt),
  ],
)

/**
 * What was attached. Points at a document version rather than copying bytes, so
 * "what exactly did we send them" is answerable years later.
 */
export const emailAttachments = pgTable(
  'email_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emailMessageId: uuid('email_message_id')
      .notNull()
      .references(() => emailMessages.id, { onDelete: 'cascade' }),

    documentVersionId: uuid('document_version_id').references(() => documentVersions.id, {
      onDelete: 'set null',
    }),
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
  },
  (t) => [index('email_attachments_message_idx').on(t.emailMessageId)],
)

/**
 * Brand training assets — Stage 3.
 *
 * Approved historical documents, letterheads, logos, stamps and signatures that
 * document analysis learns from. Originals are stored untouched and are never
 * overwritten; analysis writes its findings into `analysisResult` and proposes
 * a Brand Profile draft. Nothing here reaches a live document until an
 * Administrator approves the resulting profile.
 */
export const brandTrainingAssets = pgTable(
  'brand_training_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** What the asset is: a historical document, or a brand element. */
    assetKind: text('asset_kind').notNull(),
    /** For historical documents, which type it is an example of. */
    documentTypeHint: text('document_type_hint'),
    label: text('label').notNull(),

    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    checksumSha256: text('checksum_sha256').notNull(),

    analysisStatus: analysisStatusEnum('analysis_status').notNull().default('pending'),
    /** Structured findings: fonts, sizes, colours, margins, wording, patterns. */
    analysisResult: jsonb('analysis_result'),
    /** Per-field confidence, carried through to the reviewer. */
    analysisConfidence: jsonb('analysis_confidence'),
    analysisError: text('analysis_error'),
    analysisModel: text('analysis_model'),
    analysedAt: timestamp('analysed_at', { withTimezone: true }),

    /** The Brand Profile draft this asset contributed to. */
    proposedBrandProfileId: uuid('proposed_brand_profile_id'),

    notes: text('notes'),
    uploadedBy: uuid('uploaded_by').references(() => profiles.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    /** Archived, never deleted — the training corpus is a company record. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('brand_training_assets_storage_key_key').on(t.storageKey),
    index('brand_training_assets_kind_idx').on(t.assetKind, t.analysisStatus),
    // The same file uploaded twice is the same evidence; refuse the duplicate.
    uniqueIndex('brand_training_assets_checksum_key')
      .on(t.checksumSha256)
      .where(sql`${t.archivedAt} is null`),
  ],
)

/**
 * A record of every AI call the platform makes.
 *
 * Cost and latency matter, but the real reason is accountability: if a draft
 * contains something odd, this is how anyone finds out which model produced it,
 * from which prompt, for which user, against which record.
 */
export const aiInteractions = pgTable(
  'ai_interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    purpose: text('purpose').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),

    /** The record the request was about. */
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),

    /** Redacted prompt summary — never the full client data. */
    promptSummary: text('prompt_summary'),
    inputTokens: bigint('input_tokens', { mode: 'number' }),
    outputTokens: bigint('output_tokens', { mode: 'number' }),
    latencyMs: bigint('latency_ms', { mode: 'number' }),

    succeeded: text('succeeded').notNull().default('true'),
    failureReason: text('failure_reason'),

    requestedBy: uuid('requested_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ai_interactions_entity_idx').on(t.entityType, t.entityId),
    index('ai_interactions_time_idx').on(t.createdAt),
  ],
)

export const emailMessagesRelations = relations(emailMessages, ({ one, many }) => ({
  document: one(documents, { fields: [emailMessages.documentId], references: [documents.id] }),
  attachments: many(emailAttachments),
}))
