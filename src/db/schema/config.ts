import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
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
import {
  addressKindEnum,
  assetKindEnum,
  configStateEnum,
  documentTypeEnum,
  numberingResetEnum,
  roundingModeEnum,
  roundingStepEnum,
} from './enums'

/**
 * Company configuration — Section E of the brief.
 *
 * Every table here carries a `state`. Nothing extracted from a historical
 * document is ever activated automatically: analysis writes `draft`, an
 * Administrator promotes it, and the promotion is recorded in
 * `config_change_log` and the global audit trail.
 *
 * Phase 0 found the registered entity name printed three different ways across
 * the sample documents, so the entity itself is data with an approval state
 * rather than a constant anywhere in the codebase.
 */
export const legalEntities = pgTable(
  'legal_entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** e.g. "TZ LTD", "PTY LTD" — recorded verbatim, never normalised silently. */
    entitySuffix: text('entity_suffix'),
    countryCode: text('country_code').notNull().default('TZ'),

    registrationNumber: text('registration_number'),
    tin: text('tin'),
    vrn: text('vrn'),
    businessLicence: text('business_licence'),
    importExportLicence: text('import_export_licence'),

    isDefault: boolean('is_default').notNull().default(false),
    state: configStateEnum('state').notNull().default('draft'),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('legal_entities_state_idx').on(t.state),
    uniqueIndex('legal_entities_default_key')
      .on(t.countryCode)
      .where(sql`${t.isDefault} = true and ${t.state} = 'approved'`),
  ],
)

export const entityAddresses = pgTable(
  'entity_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalEntityId: uuid('legal_entity_id')
      .notNull()
      .references(() => legalEntities.id, { onDelete: 'cascade' }),

    label: text('label').notNull(),
    kind: addressKindEnum('kind').notNull().default('trading'),

    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    addressLine3: text('address_line3'),
    city: text('city'),
    region: text('region'),
    postalAddress: text('postal_address'),
    country: text('country').notNull().default('Tanzania'),

    phone: text('phone'),
    alternatePhone: text('alternate_phone'),
    whatsapp: text('whatsapp'),
    email: text('email'),
    website: text('website'),

    isDefault: boolean('is_default').notNull().default(false),
    displayOrder: integer('display_order').notNull().default(0),
    state: configStateEnum('state').notNull().default('draft'),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('entity_addresses_entity_idx').on(t.legalEntityId, t.displayOrder)],
)

/**
 * Bank accounts by currency. The sample invoices present a TZS and a USD
 * account from the same bank, selected by the currency of the document.
 */
export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    legalEntityId: uuid('legal_entity_id')
      .notNull()
      .references(() => legalEntities.id, { onDelete: 'cascade' }),

    currency: text('currency').notNull(),
    accountName: text('account_name').notNull(),
    bankName: text('bank_name').notNull(),
    branch: text('branch'),
    branchCode: text('branch_code'),
    accountNumber: text('account_number').notNull(),
    swiftCode: text('swift_code'),
    sortCode: text('sort_code'),

    isDefault: boolean('is_default').notNull().default(false),
    state: configStateEnum('state').notNull().default('draft'),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bank_accounts_entity_idx').on(t.legalEntityId),
    uniqueIndex('bank_accounts_default_currency_key')
      .on(t.legalEntityId, t.currency)
      .where(sql`${t.isDefault} = true and ${t.state} = 'approved'`),
  ],
)

/**
 * How internal document references are composed. The pattern is configuration;
 * the uniqueness guarantee is not — see `internalReferences` and the
 * `issue_internal_reference` database function, which allocates under a lock.
 */
export const numberingRules = pgTable(
  'numbering_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentType: documentTypeEnum('document_type').notNull(),

    /**
     * Token pattern, e.g. `{PREFIX}_{YY}{M}{SEQ}` reproduces the historical
     * `HQ_2670053`, and `{PREFIX}/{TYPE}/{YYYY}/{SEQ}` reproduces the form named
     * in the master brief. Which one HA GROUP adopts is an open decision.
     */
    pattern: text('pattern').notNull(),
    prefix: text('prefix').notNull(),
    sequencePadding: integer('sequence_padding').notNull().default(4),
    sequenceStart: integer('sequence_start').notNull().default(1),
    resetPeriod: numberingResetEnum('reset_period').notNull().default('yearly'),

    state: configStateEnum('state').notNull().default('draft'),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Exactly one approved rule per document type.
    uniqueIndex('numbering_rules_approved_key')
      .on(t.documentType)
      .where(sql`${t.state} = 'approved'`),
    index('numbering_rules_type_idx').on(t.documentType, t.state),
  ],
)

/**
 * Every reference this system has ever issued. The unique constraint on
 * `formatted` is the actual guarantee against duplicates; allocation happens
 * inside a transaction holding an advisory lock on the counter.
 *
 * Historical references from before the platform can be inserted here with
 * `issuedAt` backdated so that legacy numbers are preserved and never reissued.
 */
export const internalReferences = pgTable(
  'internal_references',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentType: documentTypeEnum('document_type').notNull(),

    periodKey: text('period_key').notNull(),
    sequence: integer('sequence').notNull(),
    formatted: text('formatted').notNull(),

    /** Set once the reference is bound to a record; null means allocated but unused. */
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),

    isLegacyImport: boolean('is_legacy_import').notNull().default(false),
    isManualOverride: boolean('is_manual_override').notNull().default(false),
    overrideReason: text('override_reason'),

    issuedBy: uuid('issued_by').references(() => profiles.id, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('internal_references_formatted_key').on(t.formatted),
    uniqueIndex('internal_references_sequence_key').on(t.documentType, t.periodKey, t.sequence),
    index('internal_references_entity_idx').on(t.entityType, t.entityId),
  ],
)

/**
 * Configurable charges such as the 20% administration line found on the sample
 * quotations. `appliesBeforeVat` is significant: the Phase 0 arithmetic showed
 * administration is added before VAT is computed, and getting that order wrong
 * changes the amount owed.
 */
export const chargeRules = pgTable(
  'charge_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    ratePercent: numeric('rate_percent', { precision: 9, scale: 5 }).notNull(),

    /** Null means the rule applies to every document type. */
    documentType: documentTypeEnum('document_type'),
    position: integer('position').notNull().default(0),
    appliesBeforeVat: boolean('applies_before_vat').notNull().default(true),

    state: configStateEnum('state').notNull().default('draft'),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('charge_rules_code_approved_key')
      .on(t.code)
      .where(sql`${t.state} = 'approved'`),
    index('charge_rules_type_idx').on(t.documentType, t.state),
  ],
)

export const taxRules = pgTable(
  'tax_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    ratePercent: numeric('rate_percent', { precision: 9, scale: 5 }).notNull(),
    documentType: documentTypeEnum('document_type'),

    state: configStateEnum('state').notNull().default('draft'),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tax_rules_code_approved_key')
      .on(t.code)
      .where(sql`${t.state} = 'approved'`),
  ],
)

/**
 * Where and how rounding happens. Phase 0 traced a TZS 0.05 discrepancy between
 * a quotation and its invoice to rounding applied at the unit-price step, so
 * this is an explicit, approved decision rather than a runtime side effect.
 */
export const roundingPolicies = pgTable(
  'rounding_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: text('scope').notNull().default('default'),
    currency: text('currency').notNull().default('TZS'),

    decimalPlaces: integer('decimal_places').notNull().default(2),
    mode: roundingModeEnum('mode').notNull().default('half_up'),
    /** The step at which rounding is applied; intermediate steps keep full precision. */
    roundAtStep: roundingStepEnum('round_at_step').notNull().default('line_total'),

    state: configStateEnum('state').notNull().default('draft'),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('rounding_policies_approved_key')
      .on(t.scope, t.currency)
      .where(sql`${t.state} = 'approved'`),
  ],
)

/**
 * Logo, partner marks, stamp and signature files.
 *
 * Stamps and signatures are sensitive: `ownerUserId` binds a signature to the
 * person it represents, and RLS plus the download route together ensure nobody
 * can fetch another person's signature image.
 */
export const companyAssets = pgTable(
  'company_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: assetKindEnum('kind').notNull(),
    label: text('label').notNull(),

    storageKey: text('storage_key').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    checksumSha256: text('checksum_sha256').notNull(),

    /** Partner marks print in a fixed order across the letterhead. */
    displayOrder: integer('display_order').notNull().default(0),
    /** Signatures belong to a specific person and are readable only by them and Administrators. */
    ownerUserId: uuid('owner_user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    isSensitive: boolean('is_sensitive').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),

    state: configStateEnum('state').notNull().default('draft'),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('company_assets_storage_key_key').on(t.storageKey),
    index('company_assets_kind_idx').on(t.kind, t.state, t.displayOrder),
    uniqueIndex('company_assets_owner_signature_key')
      .on(t.ownerUserId)
      .where(sql`${t.kind} = 'signature' and ${t.state} = 'approved'`),
  ],
)

/**
 * Versioned Brand Profile. The payload holds the typographic and layout values
 * proposed by document analysis; each version is reviewed as a whole rather
 * than merged field by field, so an approved profile is never silently altered.
 */
export const brandProfiles = pgTable(
  'brand_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: integer('version').notNull(),
    payload: jsonb('payload').notNull(),

    /** Where the values came from, e.g. "Phase 0 analysis of HQ_2670053.docx". */
    sourceNote: text('source_note'),
    /** Per-field confidence recorded by the extraction, kept for the reviewer. */
    confidence: jsonb('confidence'),

    state: configStateEnum('state').notNull().default('draft'),
    reviewComment: text('review_comment'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('brand_profiles_version_key').on(t.version),
    // At most one approved profile at any time. Every qualifying row shares the
    // same `state` value, so a unique index on it admits exactly one.
    uniqueIndex('brand_profiles_approved_key')
      .on(t.state)
      .where(sql`${t.state} = 'approved'`),
  ],
)

/**
 * Approval policy per document type — Section F.
 *
 * Director approval is the default. An Administrator may delegate approval of a
 * specific document type to Technical Officers, optionally only for urgent work
 * and below a value ceiling. Delegation never extends to applying a Director's
 * signature or the company stamp; that restriction is enforced separately and
 * cannot be configured away.
 */
export const approvalPolicies = pgTable(
  'approval_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentType: documentTypeEnum('document_type').notNull(),

    requiresDirectorApproval: boolean('requires_director_approval').notNull().default(true),
    technicalOfficerMayApprove: boolean('technical_officer_may_approve').notNull().default(false),
    /** When true, delegated approval applies only to high/critical urgency work. */
    delegationUrgentOnly: boolean('delegation_urgent_only').notNull().default(true),
    /** Optional ceiling on delegated approval. Null means no value limit. */
    delegationMaxValue: numeric('delegation_max_value', { precision: 18, scale: 2 }),
    delegationCurrency: text('delegation_currency').notNull().default('TZS'),

    requiresSignature: boolean('requires_signature').notNull().default(false),
    requiresStamp: boolean('requires_stamp').notNull().default(false),

    state: configStateEnum('state').notNull().default('draft'),
    notes: text('notes'),

    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedBy: uuid('approved_by').references(() => profiles.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('approval_policies_approved_key')
      .on(t.documentType)
      .where(sql`${t.state} = 'approved'`),
    index('approval_policies_type_idx').on(t.documentType, t.state),
  ],
)

/**
 * State transitions for every configuration record. Separate from the global
 * audit log so that "who approved this setting and when" is answerable without
 * filtering the whole system trail.
 */
export const configChangeLog = pgTable(
  'config_change_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityTable: text('entity_table').notNull(),
    entityId: uuid('entity_id').notNull(),

    fromState: configStateEnum('from_state'),
    toState: configStateEnum('to_state').notNull(),

    actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
    comment: text('comment'),
    changedFields: jsonb('changed_fields'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('config_change_log_entity_idx').on(t.entityTable, t.entityId, t.createdAt)],
)

export const legalEntitiesRelations = relations(legalEntities, ({ many }) => ({
  addresses: many(entityAddresses),
  bankAccounts: many(bankAccounts),
}))

export const entityAddressesRelations = relations(entityAddresses, ({ one }) => ({
  entity: one(legalEntities, {
    fields: [entityAddresses.legalEntityId],
    references: [legalEntities.id],
  }),
}))

export const bankAccountsRelations = relations(bankAccounts, ({ one }) => ({
  entity: one(legalEntities, {
    fields: [bankAccounts.legalEntityId],
    references: [legalEntities.id],
  }),
}))
