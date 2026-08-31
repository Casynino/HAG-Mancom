import { relations, sql } from 'drizzle-orm'
import {
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
import { clientStatusEnum, configStateEnum, projectStatusEnum } from './enums'

/**
 * A client company. Clients are archived rather than deleted so that historical
 * documents keep resolving to a real counterparty.
 */
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalName: text('legal_name').notNull(),
    tradingName: text('trading_name'),

    // Tanzanian tax identifiers. Nullable because a client record is often
    // opened before finance supplies them.
    tin: text('tin'),
    vrn: text('vrn'),
    registrationNumber: text('registration_number'),

    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    region: text('region'),
    postalAddress: text('postal_address'),
    country: text('country').notNull().default('Tanzania'),

    contactPerson: text('contact_person'),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),

    status: clientStatusEnum('status').notNull().default('active'),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('clients_legal_name_lower_key').on(sql`lower(${t.legalName})`),
    index('clients_status_idx').on(t.status),
    index('clients_tin_idx').on(t.tin),
  ],
)

/**
 * How HA GROUP is identified inside a given client's own ERP.
 *
 * Phase 0 evidence: every Alliance One tax invoice carries `Vendor ID: 635804`
 * and `Account number: 30D120216`. Those belong to the client's system, not to
 * HA GROUP, and they print on the face of the tax invoice — so they are stored
 * per client, effective-dated, and subject to the same draft/approved control
 * as the rest of company configuration.
 */
export const clientVendorIdentities = pgTable(
  'client_vendor_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),

    /** HA GROUP's supplier ID inside the client's ERP. */
    vendorId: text('vendor_id'),
    /** HA GROUP's account number inside the client's system. */
    accountNumber: text('account_number'),

    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),

    state: configStateEnum('state').notNull().default('draft'),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('client_vendor_identities_client_idx').on(t.clientId),
    // Only one approved identity per client at a time.
    uniqueIndex('client_vendor_identities_approved_key')
      .on(t.clientId)
      .where(sql`${t.state} = 'approved'`),
  ],
)

/**
 * A project is the central workspace for a client engagement. Submissions,
 * and in later phases documents, client POs, deliveries and archived files all
 * hang off this record.
 */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),
    /** HA GROUP's own internal project reference. Issued, not free-typed. */
    reference: text('reference').notNull(),
    description: text('description'),

    location: text('location'),
    gpsLatitude: numeric('gps_latitude', { precision: 10, scale: 7 }),
    gpsLongitude: numeric('gps_longitude', { precision: 10, scale: 7 }),

    status: projectStatusEnum('status').notNull().default('planning'),
    startDate: date('start_date'),
    expectedCompletionDate: date('expected_completion_date'),
    actualCompletionDate: date('actual_completion_date'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('projects_reference_key').on(t.reference),
    index('projects_client_idx').on(t.clientId),
    index('projects_status_idx').on(t.status),
  ],
)

/**
 * Project assignment. This is the gate that decides which projects an Engineer
 * can see and submit against — it is read directly by the RLS policies, so it
 * is authorisation data, not a convenience listing.
 */
export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    /** Free-text descriptor of the person's part on this project. */
    roleOnProject: text('role_on_project'),
    isLead: boolean('is_lead').notNull().default(false),

    assignedBy: uuid('assigned_by').references(() => profiles.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('project_members_live_key')
      .on(t.projectId, t.userId)
      .where(sql`${t.removedAt} is null`),
    index('project_members_user_idx').on(t.userId),
    index('project_members_project_idx').on(t.projectId),
  ],
)

export const clientsRelations = relations(clients, ({ many }) => ({
  projects: many(projects),
  vendorIdentities: many(clientVendorIdentities),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  members: many(projectMembers),
}))

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(profiles, { fields: [projectMembers.userId], references: [profiles.id] }),
}))
