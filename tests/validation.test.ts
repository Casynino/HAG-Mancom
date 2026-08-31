import { describe, expect, it } from 'vitest'
import {
  canApplySignature,
  canApplyStamp,
  defaultRouteFor,
  hasPermission,
  permissionsFor,
} from '@/lib/authz/roles'
import {
  ATTACHMENT_RULES,
  checkFile,
  contentMatchesType,
  sanitiseFilename,
} from '@/lib/storage/limits'
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/auth/password'
import {
  changePasswordSchema,
  clientSchema,
  numberingRuleSchema,
  submissionDraftSchema,
} from '@/lib/validation/schemas'

/** Pure-logic tests. No database, so these are the fast feedback loop. */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00])

describe('permission matrix', () => {
  it('gives an Engineer only their own work', () => {
    expect(hasPermission(['engineer'], 'submission.create')).toBe(true)
    expect(hasPermission(['engineer'], 'submission.view_own')).toBe(true)
    expect(hasPermission(['engineer'], 'submission.view_all')).toBe(false)
    expect(hasPermission(['engineer'], 'submission.accept')).toBe(false)
    expect(hasPermission(['engineer'], 'config.manage')).toBe(false)
    expect(hasPermission(['engineer'], 'user.manage')).toBe(false)
    expect(hasPermission(['engineer'], 'audit.view')).toBe(false)
  })

  it('gives a Technical Officer the operational surface but not administration', () => {
    expect(hasPermission(['technical_officer'], 'submission.accept')).toBe(true)
    expect(hasPermission(['technical_officer'], 'client.manage')).toBe(true)
    expect(hasPermission(['technical_officer'], 'config.view')).toBe(true)
    expect(hasPermission(['technical_officer'], 'config.manage')).toBe(false)
    expect(hasPermission(['technical_officer'], 'config.approve')).toBe(false)
    expect(hasPermission(['technical_officer'], 'user.manage')).toBe(false)
  })

  it('gives a Director oversight without operational editing', () => {
    expect(hasPermission(['director'], 'audit.view')).toBe(true)
    expect(hasPermission(['director'], 'approval.decide')).toBe(true)
    expect(hasPermission(['director'], 'client.manage')).toBe(false)
    expect(hasPermission(['director'], 'submission.accept')).toBe(false)
  })

  it('unions permissions when someone holds several roles', () => {
    const combined = permissionsFor(['engineer', 'technical_officer'])
    expect(combined.has('submission.create')).toBe(true)
    expect(combined.has('submission.accept')).toBe(true)
    expect(combined.has('user.manage')).toBe(false)
  })

  it('never lets a Technical Officer apply a signature, whatever else they hold', () => {
    // Section F states this as an absolute. It is not a configurable policy.
    expect(canApplySignature(['technical_officer'])).toBe(false)
    expect(canApplySignature(['technical_officer', 'engineer'])).toBe(false)
    expect(canApplySignature(['administrator'])).toBe(false)
    expect(canApplySignature(['director'])).toBe(true)
    // Someone holding both is acting as a Director when they sign.
    expect(canApplySignature(['technical_officer', 'director'])).toBe(true)
  })

  it('restricts the company stamp to Directors and Administrators', () => {
    expect(canApplyStamp(['technical_officer'])).toBe(false)
    expect(canApplyStamp(['director'])).toBe(true)
    expect(canApplyStamp(['administrator'])).toBe(true)
  })

  it('routes each role to where their work is', () => {
    expect(defaultRouteFor(['engineer'])).toBe('/engineer')
    expect(defaultRouteFor(['technical_officer'])).toBe('/technical')
    // A Director's work is the approval inbox, not a dashboard to read.
    expect(defaultRouteFor(['director'])).toBe('/approvals')
    expect(defaultRouteFor(['administrator'])).toBe('/admin')
    expect(defaultRouteFor([])).toBe('/dashboard')
  })

  it('gives a Director approval authority but never editing authority', () => {
    // An approver who can rewrite what they approve is not an approver.
    expect(hasPermission(['director'], 'document.approve')).toBe(true)
    expect(hasPermission(['director'], 'document.edit')).toBe(false)
    expect(hasPermission(['director'], 'document.create')).toBe(false)
  })

  it('gives a Technical Officer document authorship but not approval', () => {
    expect(hasPermission(['technical_officer'], 'document.create')).toBe(true)
    expect(hasPermission(['technical_officer'], 'document.edit')).toBe(true)
    expect(hasPermission(['technical_officer'], 'document.submit')).toBe(true)
    expect(hasPermission(['technical_officer'], 'document.approve')).toBe(false)
  })

  it('lets an Engineer see documents on their projects but change nothing', () => {
    expect(hasPermission(['engineer'], 'document.view')).toBe(true)
    expect(hasPermission(['engineer'], 'document.create')).toBe(false)
    expect(hasPermission(['engineer'], 'document.edit')).toBe(false)
    expect(hasPermission(['engineer'], 'po.manage')).toBe(false)
    expect(hasPermission(['engineer'], 'efd.manage')).toBe(false)
    // But they do sign for handover on site.
    expect(hasPermission(['engineer'], 'delivery.sign')).toBe(true)
  })

  it('keeps EFD recording away from Engineers and Directors', () => {
    expect(hasPermission(['technical_officer'], 'efd.manage')).toBe(true)
    expect(hasPermission(['administrator'], 'efd.manage')).toBe(true)
    expect(hasPermission(['director'], 'efd.manage')).toBe(false)
    expect(hasPermission(['engineer'], 'efd.manage')).toBe(false)
  })
})

describe('file validation', () => {
  it('accepts a genuine photo', () => {
    expect(
      checkFile({
        kind: 'photo',
        filename: 'site.jpg',
        contentType: 'image/jpeg',
        byteSize: 500_000,
        head: JPEG,
      }),
    ).toEqual({ ok: true })
  })

  it('rejects an executable renamed as a photo', () => {
    const result = checkFile({
      kind: 'photo',
      filename: 'payload.jpg',
      contentType: 'image/jpeg',
      byteSize: 5_000,
      head: EXE,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/do not match its type/)
  })

  it('rejects a type that is not allowed for the chosen kind', () => {
    const result = checkFile({
      kind: 'photo',
      filename: 'drawing.pdf',
      contentType: 'application/pdf',
      byteSize: 5_000,
      head: PDF,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/Photo uploads accept/)
  })

  it('rejects a file over the limit for its kind', () => {
    const result = checkFile({
      kind: 'photo',
      filename: 'huge.png',
      contentType: 'image/png',
      byteSize: ATTACHMENT_RULES.photo.maxBytes + 1,
      head: PNG,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/or smaller/)
  })

  it('rejects an empty file', () => {
    const result = checkFile({
      kind: 'photo',
      filename: 'empty.jpg',
      contentType: 'image/jpeg',
      byteSize: 0,
      head: new Uint8Array(),
    })
    expect(result.ok).toBe(false)
  })

  it('does not accept SVG as a drawing', () => {
    // SVG can carry script, so it is excluded even though it is a drawing format.
    expect(ATTACHMENT_RULES.drawing.mimeTypes).not.toContain('image/svg+xml')
  })

  it('recognises OOXML containers by their ZIP signature', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
    expect(
      contentMatchesType(zip, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toBe(true)
  })

  it('accepts CSV, which has no signature to check', () => {
    expect(contentMatchesType(new Uint8Array([0x61, 0x2c, 0x62]), 'text/csv')).toBe(true)
  })
})

describe('filename sanitisation', () => {
  it('strips directory traversal', () => {
    expect(sanitiseFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitiseFilename('..\\..\\windows\\system32')).toBe('system32')
  })

  it('removes leading dots so nothing becomes a hidden file', () => {
    expect(sanitiseFilename('...hidden.jpg')).toBe('hidden.jpg')
  })

  it('replaces characters that are unsafe in a filename', () => {
    expect(sanitiseFilename('re;port|<>.pdf')).toBe('re_port___.pdf')
  })

  it('never returns an empty name', () => {
    expect(sanitiseFilename('')).toBe('file')
    expect(sanitiseFilename('///')).toBe('file')
  })
})

describe('passwords', () => {
  it('round-trips a correct password', async () => {
    const hash = await hashPassword('a-perfectly-good-passphrase')
    expect(await verifyPassword('a-perfectly-good-passphrase', hash)).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('a-perfectly-good-passphrase')
    expect(await verifyPassword('a-perfectly-good-passphras', hash)).toBe(false)
  })

  it('produces a different hash each time for the same password', async () => {
    const a = await hashPassword('same-input-every-time')
    const b = await hashPassword('same-input-every-time')
    expect(a).not.toBe(b)
  })

  it('returns false rather than throwing on a corrupt stored value', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('anything', '')).toBe(false)
    expect(await verifyPassword('anything', 'scrypt$x$y$z$q$r')).toBe(false)
  })

  it('enforces a length-first policy', () => {
    expect(validatePasswordStrength('short1!')).not.toHaveLength(0)
    expect(validatePasswordStrength('aaaaaaaaaaaaaaaa')).not.toHaveLength(0)
    expect(validatePasswordStrength('correct horse battery staple 7')).toHaveLength(0)
  })
})

describe('input schemas', () => {
  it('rejects a submission with too little detail', () => {
    const result = submissionDraftSchema.safeParse({
      projectId: '00000000-0000-0000-0000-000000000000',
      title: 'ok',
      problemDescription: 'short',
      recommendedWork: 'short',
      urgency: 'normal',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an unknown urgency value', () => {
    const result = submissionDraftSchema.safeParse({
      projectId: '00000000-0000-0000-0000-000000000000',
      title: 'Pump vibration',
      problemDescription: 'Bearing noise on the drive end above 40 Hz.',
      recommendedWork: 'Replace both bearings and re-align the coupling.',
      urgency: 'catastrophic',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed project id', () => {
    const result = submissionDraftSchema.safeParse({
      projectId: 'not-a-uuid',
      title: 'Pump vibration',
      problemDescription: 'Bearing noise on the drive end above 40 Hz.',
      recommendedWork: 'Replace both bearings and re-align the coupling.',
      urgency: 'normal',
    })
    expect(result.success).toBe(false)
  })

  it('accepts a well-formed submission', () => {
    const result = submissionDraftSchema.safeParse({
      projectId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      title: 'Cooling pump 2 vibrating',
      problemDescription: 'Bearing noise on the drive end, heavy vibration above 40 Hz.',
      recommendedWork: 'Replace both bearings, re-align the coupling, refit the guard.',
      urgency: 'high',
      measurements: [{ label: 'Shaft runout', value: 0.12, unit: 'mm' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a TIN that is not nine digits', () => {
    expect(clientSchema.safeParse({ legalName: 'Acme Ltd', tin: '123' }).success).toBe(false)
    expect(clientSchema.safeParse({ legalName: 'Acme Ltd', tin: '100-228-211' }).success).toBe(true)
  })

  it('requires a numbering pattern to contain the sequence token', () => {
    const base = {
      documentType: 'quotation' as const,
      prefix: 'HQ',
      sequencePadding: 4,
      sequenceStart: 1,
      resetPeriod: 'yearly' as const,
    }
    expect(numberingRuleSchema.safeParse({ ...base, pattern: 'HQ_{YY}{M}' }).success).toBe(false)
    expect(
      numberingRuleSchema.safeParse({ ...base, pattern: '{PREFIX}_{YY}{M}{SEQ}' }).success,
    ).toBe(true)
  })

  it('will not let a new password match the old one', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'the-same-passphrase',
      newPassword: 'the-same-passphrase',
      confirmPassword: 'the-same-passphrase',
    })
    expect(result.success).toBe(false)
  })

  it('requires the confirmation to match', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'old-passphrase-here',
      newPassword: 'new-passphrase-here',
      confirmPassword: 'different-passphrase',
    })
    expect(result.success).toBe(false)
  })
})
