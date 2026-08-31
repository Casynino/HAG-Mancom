import { z } from 'zod'

export { fieldErrorsFrom } from './schemas'

/**
 * Document input validation.
 *
 * Money and quantities are validated as decimal STRINGS, never coerced to a
 * JavaScript number. Passing 1853413.46 through a float and back is exactly the
 * kind of silent corruption the finance engine exists to avoid, so it is
 * refused at the boundary.
 */

const uuid = z.string().uuid('That record reference is not valid.')

/** A non-negative decimal with at most 4 places, as text. */
const decimalString = (field: string, maxIntegerDigits = 14) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required.`)
    .refine((v) => /^\d+(\.\d{1,4})?$/.test(v), {
      message: `${field} must be a number, for example 1250.00`,
    })
    .refine((v) => (v.split('.')[0] ?? '').length <= maxIntegerDigits, {
      message: `${field} is too large.`,
    })

const percentString = (field: string) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,5})?$/.test(v), { message: `${field} must be a percentage.` })
    .refine((v) => Number(v) <= 100, { message: `${field} cannot exceed 100%.` })

export const DOCUMENT_TYPES = [
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
] as const

export const documentIdSchema = z.object({ documentId: uuid })

export const documentHeaderSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  projectId: uuid,
  clientPurchaseOrderId: z
    .union([uuid, z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  sourceSubmissionId: z
    .union([uuid, z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),

  title: z.string().trim().min(3, 'Give the document a title.').max(200),
  scopeDescription: z.string().trim().max(2000).optional(),
  servicePeriodLabel: z.string().trim().max(120).optional(),
  clientReference: z.string().trim().max(120).optional(),
  currency: z.string().trim().length(3, 'Use a three-letter currency code.').default('TZS'),
  documentDate: z.string().date('Enter a valid date.').optional().or(z.literal('')),
  bodyContent: z.string().trim().max(20000).optional(),
  filename: z.string().trim().max(200).optional(),

  terms: z
    .string()
    .optional()
    .transform((v) => {
      if (!v || v.trim() === '') return undefined
      try {
        return JSON.parse(v) as Record<string, string>
      } catch {
        return undefined
      }
    }),
})

export const documentLineSchema = z.object({
  kind: z
    .enum(['material', 'labour', 'equipment', 'service', 'transport', 'other'])
    .default('service'),
  description: z.string().trim().min(1, 'Every line needs a description.').max(1000),
  itemCode: z.string().trim().max(60).optional(),
  quantity: decimalString('Quantity', 10),
  unit: z.string().trim().max(24).optional(),
  unitPrice: decimalString('Unit price'),
  discountPercent: percentString('Discount').optional(),
})

export const documentLinesSchema = z
  .array(documentLineSchema)
  .max(200, 'A document can hold up to 200 lines.')

// ---------------------------------------------------------------------------
// Client Purchase Orders
// ---------------------------------------------------------------------------

export const purchaseOrderSchema = z.object({
  clientId: uuid,
  projectId: uuid,
  /**
   * The client's own number. Free-form on purpose: Phase 0 saw the SAP-style
   * `PO_4500848755`, but another client will use something else entirely, and
   * rejecting a valid PO because it does not match one client's format would be
   * worse than accepting a typo an Administrator can cancel.
   */
  poNumber: z
    .string()
    .trim()
    .min(1, 'Enter the Purchase Order number exactly as the client issued it.')
    .max(80, 'That Purchase Order number is unusually long — check it.'),
  poDate: z.string().date('Enter a valid date.').optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional(),
  currency: z.string().trim().length(3).default('TZS'),
  orderValue: decimalString('Order value').optional(),
  notes: z.string().trim().max(2000).optional(),
})

// ---------------------------------------------------------------------------
// Deliveries and completion
// ---------------------------------------------------------------------------

export const deliverySchema = z.object({
  projectId: uuid,
  clientPurchaseOrderId: z
    .union([uuid, z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  deliveryDate: z.string().date('Enter a valid date.'),
  location: z.string().trim().max(300).optional(),
  handoverPersonName: z.string().trim().min(2, 'Who handed over?').max(160),
  receiverName: z.string().trim().max(160).optional(),
  receiverTitle: z.string().trim().max(120).optional(),
  receiverPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export const deliveryItemSchema = z.object({
  description: z.string().trim().min(1, 'Describe what was delivered.').max(500),
  quantity: decimalString('Quantity', 10),
  unit: z.string().trim().max(24).optional(),
  notes: z.string().trim().max(300).optional(),
})

export const deliveryItemsSchema = z.array(deliveryItemSchema).max(200)

export const completionRecordSchema = z.object({
  projectId: uuid,
  clientPurchaseOrderId: z
    .union([uuid, z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  source: z.enum(['ha_group_certificate', 'client_acceptance']),
  completedOn: z.string().date('Enter a valid date.'),
  workDescription: z.string().trim().max(4000).optional(),
  acceptedByName: z.string().trim().max(160).optional(),
  acceptedByTitle: z.string().trim().max(120).optional(),
  engineerId: z
    .union([uuid, z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  notes: z.string().trim().max(2000).optional(),
})

// ---------------------------------------------------------------------------
// EFD receipts
// ---------------------------------------------------------------------------

export const efdReceiptSchema = z.object({
  invoiceDocumentId: uuid,
  /** Issued by TRA. Recorded, never generated. */
  receiptNumber: z
    .string()
    .trim()
    .min(1, 'Enter the receipt number exactly as it appears on the EFD receipt.')
    .max(80),
  issuedOn: z.string().date('Enter a valid date.'),
  verificationCode: z.string().trim().max(200).optional(),
  receiptTotal: decimalString('Receipt total').optional(),
  notes: z.string().trim().max(2000).optional(),
})

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export const approvalDecisionSchema = z.object({
  documentId: uuid,
  decision: z.enum(['approve', 'reject', 'request_changes']),
  comment: z.string().trim().max(4000).optional(),
  applySignature: z.boolean().default(false),
  applyStamp: z.boolean().default(false),
})

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export const complianceTypeSchema = z.object({
  code: z.string().trim().min(1).max(40).toUpperCase(),
  label: z.string().trim().min(2).max(160),
  authority: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  defaultValidityMonths: z.coerce.number().int().min(1).max(240).optional(),
  reminderDays: z
    .string()
    .trim()
    .default('90,30,14,7,1,0')
    .refine((v) => /^-?\d+(,-?\d+)*$/.test(v), {
      message: 'Give reminder days as a comma-separated list, e.g. 90,30,14,7,1,0',
    }),
})

export const complianceRecordSchema = z.object({
  complianceTypeId: uuid,
  referenceNumber: z.string().trim().max(120).optional(),
  issuedOn: z.string().date('Enter a valid date.').optional().or(z.literal('')),
  expiresOn: z.string().date('Enter a valid date.'),
  responsibleUserId: z
    .union([uuid, z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  notes: z.string().trim().max(2000).optional(),
})

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const emailAddress = z.string().trim().toLowerCase().email('Enter a valid email address.')

export const sendDocumentSchema = z.object({
  documentId: uuid,
  to: z
    .string()
    .trim()
    .min(1, 'Enter at least one recipient.')
    .transform((v) =>
      v
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(emailAddress).min(1, 'Enter at least one recipient.').max(20)),
  cc: z
    .string()
    .trim()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(emailAddress).max(20)),
  subject: z.string().trim().min(3, 'Give the email a subject.').max(300),
  body: z.string().trim().min(10, 'Write a short message.').max(20000),
})

// ---------------------------------------------------------------------------
// Repository search
// ---------------------------------------------------------------------------

export const repositorySearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  documentType: z.string().trim().max(40).optional(),
  status: z.string().trim().max(40).optional(),
  clientId: z.union([uuid, z.literal('')]).optional(),
  projectId: z.union([uuid, z.literal('')]).optional(),
  from: z.string().date().optional().or(z.literal('')),
  to: z.string().date().optional().or(z.literal('')),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
})
