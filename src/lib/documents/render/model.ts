/**
 * The shape a renderer receives.
 *
 * Deliberately a plain data structure with no database types: the PDF renderer,
 * the DOCX renderer and the on-screen preview all consume this, so what a user
 * previews is exactly what gets rendered. Building it is the only place that
 * reads the database; the renderers cannot reach past it.
 */

export interface RenderParty {
  name: string
  contactPerson?: string | null
  addressLines: string[]
  phone?: string | null
  email?: string | null
  tin?: string | null
  vrn?: string | null
  /** HA GROUP's identifiers inside this client's ERP. */
  vendorId?: string | null
  accountNumber?: string | null
}

export interface RenderCompany {
  entityName: string
  addressLines: string[]
  city?: string | null
  country: string
  phone?: string | null
  alternatePhone?: string | null
  whatsapp?: string | null
  email?: string | null
  website?: string | null
  tin?: string | null
  vrn?: string | null
  registrationNumber?: string | null
  businessLicence?: string | null
  importExportLicence?: string | null
  /** The nine-country band across the bottom of the letterhead. */
  fineprint?: string | null
}

export interface RenderBank {
  accountName: string
  bankName: string
  branch?: string | null
  branchCode?: string | null
  accountNumber: string
  currency: string
  swiftCode?: string | null
  sortCode?: string | null
}

export interface RenderLine {
  position: number
  description: string
  itemCode?: string | null
  quantity: string
  unit?: string | null
  unitPrice: string
  discountPercent?: string | null
  lineTotal: string
}

export interface RenderCharge {
  label: string
  ratePercent: string
  amount: string
  appliesBeforeVat: boolean
}

export interface RenderTotals {
  subTotal: string
  charges: RenderCharge[]
  taxableTotal: string
  taxLabel: string | null
  taxRatePercent: string | null
  taxAmount: string
  grandTotal: string
  currency: string
}

export interface RenderAsset {
  /** Data URI or absolute path the renderer can read. */
  source: string
  label: string
}

export interface RenderSeal {
  kind: 'signature' | 'stamp'
  source: string
  appliedByName: string
  appliedByRole: string
  appliedAt: string
}

export interface RenderDocument {
  documentType: string
  typeLabel: string
  reference: string | null
  documentDate: string | null

  company: RenderCompany
  client: RenderParty
  bank: RenderBank | null

  title: string
  scopeLine: string | null
  clientReference: string | null
  purchaseOrderNumber: string | null

  lines: RenderLine[]
  totals: RenderTotals | null
  /** For letters and certificates, which carry prose instead of a table. */
  bodyContent: string | null

  terms: {
    paymentTerms?: string | null
    vatStatement?: string | null
    deliveryTime?: string | null
  } | null

  preparedBy: {
    name: string
    title?: string | null
    phone?: string | null
    email?: string | null
  } | null

  /** Brand assets, in the order they print. */
  logo: RenderAsset | null
  partnerMarks: RenderAsset[]
  seals: RenderSeal[]

  footer: {
    tagline: string | null
    directorsLine: string | null
    showFooter: boolean
  }

  /** Non-null when a substitute typeface was used. Printed on the document. */
  fontSubstitutionNotice: string | null
  /** True for anything that is not an approved, issued document. */
  isDraft: boolean
  watermark: string | null
}

/**
 * Which document types print which blocks.
 *
 * Taken from the Phase 0 comparison: quotations carry terms, a typed sign-off
 * and the footer; tax invoices carry the statutory band, banking details and
 * the stamp, and no footer at all.
 */
export const DOCUMENT_LAYOUT: Record<
  string,
  {
    label: string
    showLineTable: boolean
    showTotals: boolean
    showStatutoryBand: boolean
    showBankDetails: boolean
    showTerms: boolean
    showSignOff: boolean
    showFooter: boolean
    referencePosition: 'title_band' | 'above_letterhead'
  }
> = {
  quotation: {
    label: 'QUOTATION/PROFORMA',
    showLineTable: true,
    showTotals: true,
    showStatutoryBand: false,
    showBankDetails: false,
    showTerms: true,
    showSignOff: true,
    showFooter: true,
    referencePosition: 'title_band',
  },
  tax_invoice: {
    label: 'TAX INVOICE',
    showLineTable: true,
    showTotals: true,
    showStatutoryBand: true,
    showBankDetails: true,
    showTerms: false,
    showSignOff: false,
    showFooter: false,
    referencePosition: 'above_letterhead',
  },
  export_invoice: {
    label: 'EXPORT INVOICE',
    showLineTable: true,
    showTotals: true,
    showStatutoryBand: true,
    showBankDetails: true,
    showTerms: true,
    showSignOff: false,
    showFooter: false,
    referencePosition: 'above_letterhead',
  },
  delivery_note: {
    label: 'DELIVERY NOTE',
    showLineTable: true,
    showTotals: false,
    showStatutoryBand: false,
    showBankDetails: false,
    showTerms: false,
    showSignOff: true,
    showFooter: true,
    referencePosition: 'title_band',
  },
  official_letter: {
    label: '',
    showLineTable: false,
    showTotals: false,
    showStatutoryBand: false,
    showBankDetails: false,
    showTerms: false,
    showSignOff: true,
    showFooter: true,
    referencePosition: 'title_band',
  },
  completion_certificate: {
    label: 'CERTIFICATE OF COMPLETION',
    showLineTable: false,
    showTotals: false,
    showStatutoryBand: false,
    showBankDetails: false,
    showTerms: false,
    showSignOff: true,
    showFooter: true,
    referencePosition: 'title_band',
  },
  payment_request: {
    label: 'PAYMENT REQUEST',
    showLineTable: true,
    showTotals: true,
    showStatutoryBand: false,
    showBankDetails: true,
    showTerms: false,
    showSignOff: true,
    showFooter: true,
    referencePosition: 'title_band',
  },
  site_report: {
    label: 'SITE REPORT',
    showLineTable: false,
    showTotals: false,
    showStatutoryBand: false,
    showBankDetails: false,
    showTerms: false,
    showSignOff: true,
    showFooter: true,
    referencePosition: 'title_band',
  },
}

export function layoutFor(documentType: string) {
  return (
    DOCUMENT_LAYOUT[documentType] ?? {
      label: documentType.replace(/_/g, ' ').toUpperCase(),
      showLineTable: true,
      showTotals: true,
      showStatutoryBand: false,
      showBankDetails: false,
      showTerms: false,
      showSignOff: true,
      showFooter: true,
      referencePosition: 'title_band' as const,
    }
  )
}
