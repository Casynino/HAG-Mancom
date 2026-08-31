import { relations } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { profiles } from './auth'
import { appRoleEnum, approvalDecisionEnum, notificationKindEnum } from './enums'

/**
 * Immutable system-wide audit trail.
 *
 * Immutability is enforced in the database, not by convention: the application
 * role is granted INSERT and SELECT only, and a trigger raises on any UPDATE or
 * DELETE regardless of who attempts it. Nothing in the application can rewrite
 * history.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
    /** Snapshotted at write time — a later role change must not rewrite the past. */
    actorRole: appRoleEnum('actor_role'),
    actorEmail: text('actor_email'),

    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),

    metadata: jsonb('metadata'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    index('audit_log_actor_idx').on(t.actorId, t.createdAt),
    index('audit_log_action_idx').on(t.action, t.createdAt),
    index('audit_log_time_idx').on(t.createdAt),
  ],
)

/**
 * Approval decisions — Section F.
 *
 * Generic over subject type so the same ledger serves submissions now and
 * documents in the Document Engine phase. Every decision records the actor, the
 * role they held at the time, the version they judged, and both statuses.
 */
export const approvalDecisions = pgTable(
  'approval_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    /** Which version of the subject was actually reviewed. */
    subjectVersion: integer('subject_version').notNull().default(1),

    decision: approvalDecisionEnum('decision').notNull(),

    actorId: uuid('actor_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),
    /** The role exercised to make this decision, snapshotted. */
    actorRole: appRoleEnum('actor_role').notNull(),
    /**
     * True when a Technical Officer acted under a delegated approval policy
     * rather than as Director. Recorded so delegated approvals are auditable
     * as a distinct class.
     */
    underDelegation: boolean('under_delegation').notNull().default(false),

    priorStatus: text('prior_status'),
    newStatus: text('new_status'),
    comment: text('comment'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('approval_decisions_subject_idx').on(t.subjectType, t.subjectId, t.createdAt),
    index('approval_decisions_actor_idx').on(t.actorId, t.createdAt),
  ],
)

/**
 * In-app notifications. Each carries the entity it refers to so the UI can
 * navigate straight to the record that needs attention.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    kind: notificationKindEnum('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),

    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    /** Relative path the notification links to. Never an external URL. */
    href: text('href'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.createdAt),
    index('notifications_unread_idx').on(t.userId, t.readAt),
  ],
)

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(profiles, { fields: [auditLog.actorId], references: [profiles.id] }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(profiles, { fields: [notifications.userId], references: [profiles.id] }),
}))
