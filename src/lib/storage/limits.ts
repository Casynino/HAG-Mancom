/**
 * File acceptance rules.
 *
 * An upload is untrusted input. Three things are checked, in order, and all
 * three must agree before a byte is stored:
 *
 *   1. Declared MIME type is on the allow-list for the attachment kind.
 *   2. Size is within the limit for that kind.
 *   3. The leading bytes actually match the declared type.
 *
 * Check 3 is the one that matters: a browser will happily report whatever the
 * filename extension suggests, so `payload.exe` renamed to `photo.jpg` arrives
 * claiming to be an image. Sniffing the magic number catches that.
 *
 * Pure module — no server imports — so the rules are unit-testable and can also
 * be used client-side to fail fast before an upload starts.
 */

export type AttachmentKind =
  'photo' | 'video' | 'voice_note' | 'drawing' | 'spreadsheet' | 'document'

const MB = 1024 * 1024

export interface KindRule {
  label: string
  /** What a phone should offer when the Engineer taps the control. */
  accept: string
  mimeTypes: readonly string[]
  maxBytes: number
  extensions: readonly string[]
}

export const ATTACHMENT_RULES: Record<AttachmentKind, KindRule> = {
  photo: {
    label: 'Photo',
    accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif',
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    maxBytes: 15 * MB,
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'],
  },
  video: {
    label: 'Video',
    accept: 'video/mp4,video/quicktime,video/webm',
    mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
    maxBytes: 100 * MB,
    extensions: ['.mp4', '.mov', '.webm'],
  },
  voice_note: {
    label: 'Voice note',
    accept: 'audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/webm,audio/ogg',
    mimeTypes: [
      'audio/mpeg',
      'audio/mp4',
      'audio/aac',
      'audio/wav',
      'audio/x-wav',
      'audio/webm',
      'audio/ogg',
    ],
    maxBytes: 25 * MB,
    extensions: ['.mp3', '.m4a', '.aac', '.wav', '.webm', '.ogg'],
  },
  drawing: {
    label: 'Drawing',
    accept: 'application/pdf,image/png,image/jpeg,image/svg+xml',
    // SVG is deliberately excluded from the stored allow-list: it is an active
    // format that can carry script. Engineers upload drawings as PDF or image.
    mimeTypes: ['application/pdf', 'image/png', 'image/jpeg'],
    maxBytes: 30 * MB,
    extensions: ['.pdf', '.png', '.jpg', '.jpeg'],
  },
  spreadsheet: {
    label: 'Spreadsheet',
    accept:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ],
    maxBytes: 20 * MB,
    extensions: ['.xlsx', '.xls', '.csv'],
  },
  document: {
    label: 'Document',
    accept:
      'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword',
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ],
    maxBytes: 30 * MB,
    extensions: ['.pdf', '.docx', '.doc'],
  },
}

export const MAX_ATTACHMENTS_PER_SUBMISSION = 40

/** Magic numbers, keyed by the container they identify. */
const SIGNATURES: Array<{ bytes: number[]; offset: number; types: string[] }> = [
  { bytes: [0xff, 0xd8, 0xff], offset: 0, types: ['image/jpeg'] },
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0, types: ['image/png'] },
  { bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], offset: 0, types: ['application/pdf'] },
  // ZIP container — xlsx, docx and any other OOXML file.
  {
    bytes: [0x50, 0x4b],
    offset: 0,
    types: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  // Legacy OLE2 compound file — .doc and .xls.
  {
    bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    offset: 0,
    types: ['application/msword', 'application/vnd.ms-excel'],
  },
  { bytes: [0x49, 0x44, 0x33], offset: 0, types: ['audio/mpeg'] },
  { bytes: [0x4f, 0x67, 0x67, 0x53], offset: 0, types: ['audio/ogg'] },
  // RIFF....WAVE
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, types: ['audio/wav', 'audio/x-wav'] },
  // ISO base media (ftyp) — mp4, mov, m4a, heic all share this at offset 4.
  {
    bytes: [0x66, 0x74, 0x79, 0x70],
    offset: 4,
    types: ['video/mp4', 'video/quicktime', 'audio/mp4', 'audio/aac', 'image/heic', 'image/heif'],
  },
  // EBML — webm, for both video and audio tracks.
  {
    bytes: [0x1a, 0x45, 0xdf, 0xa3],
    offset: 0,
    types: ['video/webm', 'audio/webm'],
  },
  // RIFF....WEBP
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, types: ['image/webp'] },
]

/**
 * Does the content look like what it claims to be?
 *
 * text/csv has no signature and is returned as acceptable on the strength of
 * the other checks — it is a plain-text format with no executable surface.
 */
export function contentMatchesType(head: Uint8Array, declaredType: string): boolean {
  if (declaredType === 'text/csv') return true

  const candidates = SIGNATURES.filter((sig) => sig.types.includes(declaredType))
  if (candidates.length === 0) return false

  return candidates.some((sig) => {
    if (head.length < sig.offset + sig.bytes.length) return false
    return sig.bytes.every((b, i) => head[sig.offset + i] === b)
  })
}

export interface FileCheckInput {
  kind: AttachmentKind
  filename: string
  contentType: string
  byteSize: number
  head: Uint8Array
}

export type FileCheckResult = { ok: true } | { ok: false; reason: string }

export function checkFile(input: FileCheckInput): FileCheckResult {
  const rule = ATTACHMENT_RULES[input.kind]
  if (!rule) return { ok: false, reason: 'Unknown attachment type.' }

  if (input.byteSize <= 0) {
    return { ok: false, reason: 'That file is empty.' }
  }

  if (input.byteSize > rule.maxBytes) {
    return {
      ok: false,
      reason: `${rule.label} files must be ${formatBytes(rule.maxBytes)} or smaller. This one is ${formatBytes(input.byteSize)}.`,
    }
  }

  const declared = input.contentType.split(';')[0]!.trim().toLowerCase()
  if (!rule.mimeTypes.includes(declared)) {
    return {
      ok: false,
      reason: `${rule.label} uploads accept ${rule.extensions.join(', ')}. That file is ${declared || 'of an unknown type'}.`,
    }
  }

  if (!contentMatchesType(input.head, declared)) {
    return {
      ok: false,
      reason: 'That file’s contents do not match its type. Re-export it and try again.',
    }
  }

  return { ok: true }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`
}

/** Strips directory components and anything that is not safe in a filename. */
export function sanitiseFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file'
  const cleaned = base
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[^A-Za-z0-9._ ()-]/g, '_')
    .replace(/^\.+/, '')
    .trim()
  return (cleaned || 'file').slice(0, 180)
}
