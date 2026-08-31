import { z } from 'zod'
import { APP_ROLES } from '@/lib/authz/roles'

/**
 * Input validation.
 *
 * Every Server Action parses its input here before touching the database. The
 * schemas are also the source of the messages shown next to fields, so the
 * wording is written for the person filling the form, not for a developer.
 *
 * Pure module — no server imports — so these are unit-testable and reusable on
 * the client for immediate feedback.
 */

const trimmed = (max: number) => z.string().trim().max(max)

const requiredText = (field: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${field} is required.` : `${field} must be at least ${min} characters.`)
    .max(max, `${field} must be ${max} characters or fewer.`)

const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v))

const uuid = z.string().uuid('That record reference is not valid.')

/** Accepts what a phone keypad produces; normalises nothing beyond trimming. */
const phone = trimmed(40).regex(/^[+0-9 ()\-]*$/, 'Use digits, spaces, brackets, + and - only.')

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email address is required.')
  .max(254, 'That email address is too long.')
  .email('Enter a valid email address.')

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required.').max(200),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.').max(200),
    newPassword: z.string().min(12, 'Use at least 12 characters.').max(200),
    confirmPassword: z.string().min(1, 'Confirm your new password.').max(200),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Those passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'Choose a password you have not used here before.',
    path: ['newPassword'],
  })

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const createUserSchema = z.object({
  email,
  fullName: requiredText('Full name', 2, 160),
  phone: phone.optional().transform((v) => (v === '' ? undefined : v)),
  jobTitle: optionalText(120),
  roles: z
    .array(z.enum(APP_ROLES))
    .min(1, 'Select at least one role.')
    .max(APP_ROLES.length),
  temporaryPassword: z.string().min(12, 'Use at least 12 characters.').max(200),
})

export const updateUserRolesSchema = z.object({
  userId: uuid,
  roles: z.array(z.enum(APP_ROLES)).max(APP_ROLES.length),
})

export const setUserActiveSchema = z.object({
  userId: uuid,
  isActive: z.boolean(),
})

// ---------------------------------------------------------------------------
// Clients and projects
// ---------------------------------------------------------------------------

export const clientSchema = z.object({
  legalName: requiredText('Company name', 2, 200),
  tradingName: optionalText(200),
  // Tanzanian TIN is nine digits, conventionally written 000-000-000.
  tin: optionalText(20).refine((v) => v === undefined || /^[0-9-]{9,20}$/.test(v), {
    message: 'A TIN is nine digits, for example 100-228-211.',
  }),
  vrn: optionalText(20),
  registrationNumber: optionalText(60),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(120),
  region: optionalText(120),
  postalAddress: optionalText(120),
  country: trimmed(80).default('Tanzania'),
  contactPerson: optionalText(160),
  contactPhone: phone.optional().transform((v) => (v === '' ? undefined : v)),
  contactEmail: z
    .union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email address.')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  notes: optionalText(2000),
})

export const projectSchema = z.object({
  clientId: uuid,
  name: requiredText('Project name', 2, 200),
  reference: requiredText('Project reference', 2, 60),
  description: optionalText(4000),
  location: optionalText(300),
  startDate: z.string().date('Enter a valid date.').optional().or(z.literal('')),
  expectedCompletionDate: z.string().date('Enter a valid date.').optional().or(z.literal('')),
})

export const projectMemberSchema = z.object({
  projectId: uuid,
  userId: uuid,
  roleOnProject: optionalText(120),
  isLead: z.boolean().default(false),
})

// ---------------------------------------------------------------------------
// Engineer submissions
//
// Kept short on purpose. The brief's principle is that an Engineer supplies
// information rather than writing a report, so the free-text fields have modest
// minimums and the structure carries the detail.
// ---------------------------------------------------------------------------

export const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low', hint: 'Can wait for the next planned visit' },
  { value: 'normal', label: 'Normal', hint: 'Schedule in the usual way' },
  { value: 'high', label: 'High', hint: 'Needs attention this week' },
  { value: 'critical', label: 'Critical', hint: 'Production is stopped or unsafe' },
] as const

export const measurementSchema = z.object({
  label: requiredText('Measurement name', 1, 120),
  value: z.coerce.number().finite('Enter a number.'),
  unit: requiredText('Unit', 1, 24),
  notes: optionalText(400),
})

export const submissionDraftSchema = z.object({
  projectId: uuid,
  title: requiredText('Title', 3, 200),
  problemDescription: requiredText('What did you find', 10, 4000),
  recommendedWork: requiredText('What needs doing', 10, 4000),
  urgency: z.enum(['low', 'normal', 'high', 'critical']),
  siteVisitDate: z.string().date('Enter a valid date.').optional().or(z.literal('')),
  gpsLatitude: z.coerce.number().min(-90).max(90).optional(),
  gpsLongitude: z.coerce.number().min(-180).max(180).optional(),
  gpsAccuracyMetres: z.coerce.number().min(0).max(100000).optional(),
  measurements: z.array(measurementSchema).max(50, 'Up to 50 measurements.').default([]),
})

export const submissionIdSchema = z.object({ submissionId: uuid })

export const attachmentMetaSchema = z.object({
  submissionId: uuid,
  kind: z.enum(['photo', 'video', 'voice_note', 'drawing', 'spreadsheet', 'document']),
  caption: optionalText(300),
})

// ---------------------------------------------------------------------------
// Technical Officer review
// ---------------------------------------------------------------------------

export const reviewNoteSchema = z.object({
  submissionId: uuid,
  internalReviewNotes: optionalText(4000),
})

export const requestChangesSchema = z.object({
  submissionId: uuid,
  comment: requiredText('Explain what needs correcting', 10, 2000),
})

export const acceptSubmissionSchema = z.object({
  submissionId: uuid,
  comment: optionalText(2000),
})

export const relinkSubmissionSchema = z.object({
  submissionId: uuid,
  projectId: uuid,
  reason: requiredText('Reason', 5, 500),
})

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const CONFIG_TABLES = [
  'legal_entities',
  'entity_addresses',
  'bank_accounts',
  'numbering_rules',
  'charge_rules',
  'tax_rules',
  'rounding_policies',
  'brand_profiles',
  'approval_policies',
  'client_vendor_identities',
] as const

export const configDecisionSchema = z.object({
  table: z.enum(CONFIG_TABLES),
  id: uuid,
  decision: z.enum(['approve', 'reject']),
  comment: optionalText(2000),
})

export const legalEntitySchema = z.object({
  name: requiredText('Entity name', 2, 200),
  entitySuffix: optionalText(40),
  countryCode: trimmed(2).default('TZ'),
  registrationNumber: optionalText(60),
  tin: optionalText(30),
  vrn: optionalText(30),
  businessLicence: optionalText(60),
  importExportLicence: optionalText(60),
  notes: optionalText(2000),
})

export const bankAccountSchema = z.object({
  legalEntityId: uuid,
  currency: trimmed(3).min(3, 'Use a three-letter currency code.'),
  accountName: requiredText('Account name', 2, 200),
  bankName: requiredText('Bank name', 2, 200),
  branch: optionalText(120),
  branchCode: optionalText(40),
  accountNumber: requiredText('Account number', 4, 60),
  swiftCode: optionalText(20),
  sortCode: optionalText(20),
  notes: optionalText(2000),
})

export const numberingRuleSchema = z.object({
  documentType: z.enum([
    'quotation',
    'tax_invoice',
    'delivery_note',
    'official_letter',
    'payment_request',
    'site_report',
    'completion_certificate',
    'purchase_order_record',
    'compliance_document',
    'export_invoice',
    'efd_receipt',
  ]),
  pattern: requiredText('Pattern', 3, 120).refine((v) => v.includes('{SEQ}'), {
    message: 'The pattern must contain {SEQ}, which is where the running number goes.',
  }),
  prefix: requiredText('Prefix', 1, 20),
  sequencePadding: z.coerce.number().int().min(1).max(12),
  sequenceStart: z.coerce.number().int().min(1).max(1_000_000),
  resetPeriod: z.enum(['never', 'yearly', 'monthly']),
  notes: optionalText(2000),
})

export const chargeRuleSchema = z.object({
  code: requiredText('Code', 1, 30).toUpperCase(),
  label: requiredText('Label', 1, 120),
  ratePercent: z.coerce
    .number()
    .min(0, 'A rate cannot be negative.')
    .max(100, 'A rate cannot exceed 100%.'),
  documentType: z.string().optional(),
  position: z.coerce.number().int().min(0).max(100).default(0),
  appliesBeforeVat: z.boolean().default(true),
  notes: optionalText(2000),
})

export const roundingPolicySchema = z.object({
  scope: trimmed(60).default('default'),
  currency: trimmed(3).min(3, 'Use a three-letter currency code.'),
  decimalPlaces: z.coerce.number().int().min(0).max(6),
  mode: z.enum(['half_up', 'half_even', 'half_down', 'floor', 'ceil']),
  roundAtStep: z.enum(['unit_price', 'line_total', 'subtotal', 'grand_total']),
  notes: optionalText(2000),
})

export const approvalPolicySchema = z.object({
  documentType: z.enum([
    'quotation',
    'tax_invoice',
    'delivery_note',
    'official_letter',
    'payment_request',
    'site_report',
    'completion_certificate',
    'purchase_order_record',
    'compliance_document',
    'export_invoice',
    'efd_receipt',
  ]),
  requiresDirectorApproval: z.boolean().default(true),
  technicalOfficerMayApprove: z.boolean().default(false),
  delegationUrgentOnly: z.boolean().default(true),
  delegationMaxValue: z.coerce.number().min(0).optional(),
  delegationCurrency: trimmed(3).default('TZS'),
  requiresSignature: z.boolean().default(false),
  requiresStamp: z.boolean().default(false),
  notes: optionalText(2000),
})

export const clientVendorIdentitySchema = z.object({
  clientId: uuid,
  vendorId: optionalText(60),
  accountNumber: optionalText(60),
  notes: optionalText(2000),
})

/** Collapses a ZodError into the shape the forms render. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    ;(out[key] ??= []).push(issue.message)
  }
  return out
}
