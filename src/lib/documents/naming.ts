/**
 * Document filenames.
 *
 * The brief asks for meaningful names — "Quotation - ABC Company - Pump
 * Installation - July 2026.pdf" — and for the user to be able to change one
 * before approval. Phase 0 found no such convention in the historical files
 * (they are saved as bare references like HQ-2670053.pdf), so this is a new
 * standard rather than something learned.
 *
 * Pure module, so the same name is proposed on the client and produced on the
 * server without them drifting apart.
 */

const TYPE_LABELS: Record<string, string> = {
  quotation: 'Quotation',
  tax_invoice: 'Invoice',
  delivery_note: 'Delivery Note',
  official_letter: 'Letter',
  payment_request: 'Payment Request',
  site_report: 'Site Report',
  completion_certificate: 'Completion Certificate',
  purchase_order_record: 'Purchase Order',
  compliance_document: 'Compliance',
  export_invoice: 'Export Invoice',
  efd_receipt: 'EFD Receipt',
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export interface FilenameParts {
  documentType: string
  clientName: string
  title: string
  date: Date
  reference?: string | null
}

/**
 * Strips anything that would be awkward in a filename on Windows, macOS or a
 * mail attachment, and collapses the result to a sensible length.
 */
function clean(value: string, maxLength = 60): string {
  const stripped = value
    .replace(/[\\/:*?"<>|]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (stripped.length <= maxLength) return stripped

  // Cut on a word boundary rather than mid-word.
  const truncated = stripped.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated).trim()
}

export function proposeFilename(parts: FilenameParts): string {
  const label = TYPE_LABELS[parts.documentType] ?? 'Document'
  const period = `${MONTHS[parts.date.getMonth()]} ${parts.date.getFullYear()}`

  const segments = [label, clean(parts.clientName, 45), clean(parts.title, 50), period].filter(
    (s) => s.length > 0,
  )

  return `${segments.join(' - ')}.pdf`
}

/** Swaps the extension, for the DOCX rendering of the same document. */
export function withExtension(filename: string, extension: 'pdf' | 'docx'): string {
  const base = filename.replace(/\.(pdf|docx)$/i, '')
  return `${base}.${extension}`
}

/** Validates a filename a user typed. */
export function validateFilename(value: string): string[] {
  const problems: string[] = []
  const trimmed = value.trim()

  if (trimmed.length === 0) problems.push('A filename is required.')
  if (trimmed.length > 200) problems.push('Keep the filename under 200 characters.')
  if (/[\\/:*?"<>|]/.test(trimmed)) problems.push('Avoid the characters \\ / : * ? " < > |')
  if (!/\.(pdf|docx)$/i.test(trimmed)) problems.push('The filename should end in .pdf or .docx')

  return problems
}

export { TYPE_LABELS as DOCUMENT_TYPE_FILENAME_LABELS }
