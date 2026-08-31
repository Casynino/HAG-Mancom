import type { Tone } from '@/components/ui'

/**
 * Presentation vocabulary.
 *
 * Status names are written for the person reading them, not lifted from the
 * database enum: "With the Technical Officer" tells an Engineer where their
 * work actually is, which `submitted` does not.
 */

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'accepted'
  | 'ready_for_documentation'
  | 'cancelled'

interface StatusPresentation {
  label: string
  /** How the Engineer who filed it should read this status. */
  engineerLabel: string
  tone: Tone
}

export const SUBMISSION_STATUS: Record<SubmissionStatus, StatusPresentation> = {
  draft: { label: 'Draft', engineerLabel: 'Draft — not sent yet', tone: 'neutral' },
  submitted: {
    label: 'Waiting for review',
    engineerLabel: 'With the Technical Officer',
    tone: 'brand',
  },
  under_review: { label: 'Being reviewed', engineerLabel: 'Being reviewed', tone: 'brand' },
  changes_requested: {
    label: 'Returned for correction',
    engineerLabel: 'Needs your correction',
    tone: 'warn',
  },
  accepted: { label: 'Accepted', engineerLabel: 'Accepted', tone: 'ok' },
  ready_for_documentation: {
    label: 'Ready for documents',
    engineerLabel: 'Accepted — documents next',
    tone: 'ok',
  },
  cancelled: { label: 'Cancelled', engineerLabel: 'Cancelled', tone: 'risk' },
}

export type Urgency = 'low' | 'normal' | 'high' | 'critical'

export const URGENCY: Record<Urgency, { label: string; tone: Tone }> = {
  low: { label: 'Low', tone: 'neutral' },
  normal: { label: 'Normal', tone: 'neutral' },
  high: { label: 'High', tone: 'warn' },
  critical: { label: 'Critical', tone: 'risk' },
}

export const CONFIG_STATE: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending_approval: { label: 'Awaiting approval', tone: 'warn' },
  approved: { label: 'In effect', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'risk' },
  superseded: { label: 'Superseded', tone: 'neutral' },
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  quotation: 'Quotation',
  tax_invoice: 'Tax Invoice',
  delivery_note: 'Delivery Note',
  official_letter: 'Official Letter',
  payment_request: 'Payment Request',
  site_report: 'Site Report',
  completion_certificate: 'Completion Certificate',
  purchase_order_record: 'Purchase Order record',
  compliance_document: 'Compliance document',
  export_invoice: 'Export Invoice',
  efd_receipt: 'EFD Receipt',
}

export const ATTACHMENT_KIND_LABELS: Record<string, string> = {
  photo: 'Photo',
  video: 'Video',
  voice_note: 'Voice note',
  drawing: 'Drawing',
  spreadsheet: 'Spreadsheet',
  document: 'Document',
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : dateFormatter.format(d)
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFormatter.format(d)
}

/** "3 hours ago" for queue ageing, where elapsed time is the useful fact. */
export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'

  const seconds = Math.round((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'

  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [604800, 'week'],
    [2629800, 'month'],
  ]

  const rtf = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' })
  for (let i = 0; i < units.length; i += 1) {
    const [divisor, unit] = units[i]!
    const next = units[i + 1]?.[0] ?? Infinity
    if (seconds < next) return rtf.format(-Math.round(seconds / divisor), unit)
  }
  return rtf.format(-Math.round(seconds / 31557600), 'year')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
