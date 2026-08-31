import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { appRoleEnum } from './enums'

/**
 * A person who can sign in. Password material lives here and is never selected
 * into any query that reaches the client — see src/lib/auth/password.ts.
 */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    jobTitle: text('job_title'),

    passwordHash: text('password_hash').notNull(),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
    mustChangePassword: boolean('must_change_password').notNull().default(true),

    isActive: boolean('is_active').notNull().default(true),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Case-insensitive uniqueness without requiring the citext extension.
    uniqueIndex('profiles_email_lower_key').on(sql`lower(${t.email})`),
    index('profiles_active_idx').on(t.isActive),
  ],
)

/**
 * Role grants. A user may hold more than one role. A grant is live while
 * revoked_at is null; revoking preserves the historical record rather than
 * deleting it, so the audit trail stays intact.
 */
export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: appRoleEnum('role').notNull(),
    grantedBy: uuid('granted_by').references(() => profiles.id, { onDelete: 'set null' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (t) => [
    // One live grant per (user, role); revoked rows are exempt so history accumulates.
    uniqueIndex('user_roles_live_key')
      .on(t.userId, t.role)
      .where(sql`${t.revokedAt} is null`),
    index('user_roles_user_idx').on(t.userId),
  ],
)

/**
 * Server-side sessions. The cookie carries a random token; only its SHA-256
 * digest is stored, so a database read cannot be replayed as a login.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expiry_idx').on(t.expiresAt),
  ],
)

/**
 * Login attempt ledger. Backs both the per-account lockout and a coarse
 * per-IP rate limit, and gives the audit trail a record of failures.
 */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    ipAddress: text('ip_address'),
    successful: boolean('successful').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('login_attempts_email_time_idx').on(sql`lower(${t.email})`, t.createdAt),
    index('login_attempts_ip_time_idx').on(t.ipAddress, t.createdAt),
  ],
)

export const profilesRelations = relations(profiles, ({ many }) => ({
  roles: many(userRoles),
  sessions: many(sessions),
}))

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(profiles, { fields: [userRoles.userId], references: [profiles.id] }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(profiles, { fields: [sessions.userId], references: [profiles.id] }),
}))
