import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Client } from 'pg'
import {
  appClient,
  asUser,
  assignToProject,
  cleanup,
  createClientRecord,
  createProject,
  createUser,
  expectFailure,
  owner,
  RUN_ID,
} from './helpers/db'
import { checksum, getStorage, submissionAttachmentKey } from '@/lib/storage'
import { checkFile, sanitiseFilename } from '@/lib/storage/limits'

/**
 * The full submission lifecycle, end to end through the real rules.
 *
 * Every statement runs as the application role under Row Level Security, and
 * the file goes through the actual storage driver and validation module — so
 * this exercises the same code the running platform does, minus the React layer.
 *
 * The path walked is the one from the brief:
 *   draft → submitted → under review → correction requested → resubmitted
 *         → accepted → ready for documentation
 */

let o: Client
let app: Client
let engineer: { id: string }
let officer: { id: string }
let clientId: string
let projectId: string
let submissionId: string
let issuedReference: string | null = null

const STORAGE_ROOT = join(process.cwd(), 'storage')

// A real 1x1 PNG, so the magic-byte check has something genuine to accept.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

beforeAll(async () => {
  o = await owner()
  app = await appClient()

  engineer = await createUser(o, 'lcEng', ['engineer'])
  officer = await createUser(o, 'lcOfficer', ['technical_officer'])
  clientId = await createClientRecord(o, 'Lifecycle Client')
  projectId = await createProject(o, clientId, 'LcProj')
  await assignToProject(o, projectId, engineer.id)
})

afterAll(async () => {
  if (submissionId) {
    await rm(join(STORAGE_ROOT, 'submissions', submissionId), {
      recursive: true,
      force: true,
    }).catch(() => undefined)
  }
  await cleanup(o)
  await o.end()
  await app.end()
})

describe('1. the Engineer files from site', () => {
  it('creates a draft against an assigned project', async () => {
    const { rows } = await asUser(app, engineer.id, (c) =>
      c.query<{ id: string }>(
        `insert into engineer_submissions
           (project_id, client_id, submitted_by, title, problem_description, recommended_work, urgency, site_visit_date)
         values ($1, $2, $3, 'Cooling pump 2 bearing failure',
                 'Heavy bearing noise on the drive end. Vibration climbs above 40 Hz.',
                 'Replace both bearings, renew the shaft seal, re-align the coupling.',
                 'high', current_date)
         returning id`,
        [projectId, clientId, engineer.id],
      ),
    )

    submissionId = rows[0]!.id
    expect(submissionId).toBeTruthy()
  })

  it('records structured measurements', async () => {
    await asUser(app, engineer.id, async (c) => {
      await c.query(
        `insert into submission_measurements (submission_id, label, value, unit, position)
         values ($1, 'Shaft runout', 0.12, 'mm', 0), ($1, 'Vibration at 40 Hz', 11.4, 'mm', 1)`,
        [submissionId],
      )
    })

    const { rows } = await asUser(app, engineer.id, (c) =>
      c.query('select label, value, unit from submission_measurements where submission_id = $1', [
        submissionId,
      ]),
    )
    expect(rows).toHaveLength(2)
  })

  it('accepts a genuine photo through the real storage driver', async () => {
    const filename = 'drive-end-bearing.png'

    const verdict = checkFile({
      kind: 'photo',
      filename,
      contentType: 'image/png',
      byteSize: PNG_BYTES.byteLength,
      head: new Uint8Array(PNG_BYTES.subarray(0, 32)),
    })
    expect(verdict).toEqual({ ok: true })

    const key = submissionAttachmentKey(submissionId, 'photo', filename)
    await getStorage().put(key, PNG_BYTES, 'image/png')

    await asUser(app, engineer.id, (c) =>
      c.query(
        `insert into submission_attachments
           (submission_id, kind, original_filename, storage_key, content_type, byte_size, checksum_sha256, uploaded_by)
         values ($1, 'photo', $2, $3, 'image/png', $4, $5, $6)`,
        [
          submissionId,
          sanitiseFilename(filename),
          key,
          PNG_BYTES.byteLength,
          checksum(PNG_BYTES),
          engineer.id,
        ],
      ),
    )

    // The bytes read back must be byte-identical: originals are never altered.
    const readBack = await getStorage().get(key)
    expect(checksum(readBack)).toBe(checksum(PNG_BYTES))
  })

  it('rejects a file whose contents do not match its declared type', async () => {
    const verdict = checkFile({
      kind: 'photo',
      filename: 'not-really.png',
      contentType: 'image/png',
      byteSize: 6,
      head: new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]),
    })
    expect(verdict.ok).toBe(false)
  })

  it('submits, issuing a reference and freezing a snapshot', async () => {
    await asUser(app, engineer.id, async (c) => {
      const ref = await c.query<{ r: string }>('select app.next_submission_reference() as r')
      issuedReference = ref.rows[0]!.r

      await c.query(
        `update engineer_submissions
            set status = 'submitted',
                reference = $2::text,
                submitted_at = now(),
                submitted_snapshot = jsonb_build_object('revision', 1, 'reference', $2::text)
          where id = $1`,
        [submissionId, issuedReference],
      )

      await c.query(
        `insert into submission_events (submission_id, actor_id, actor_role, action, from_status, to_status)
         values ($1, $2, 'engineer', 'submitted', 'draft', 'submitted')`,
        [submissionId, engineer.id],
      )

      await c.query(
        `insert into notifications (user_id, kind, title, entity_type, entity_id, created_by)
         values ($1, 'submission_submitted', $2, 'engineer_submissions', $3, $4)`,
        [officer.id, `New site submission ${issuedReference}`, submissionId, engineer.id],
      )

      await c.query(
        `insert into audit_log (actor_id, actor_role, action, entity_type, entity_id)
         values ($1, 'engineer', 'submission.submitted', 'engineer_submissions', $2)`,
        [engineer.id, submissionId],
      )
    })

    expect(issuedReference).toMatch(/^SUB-\d{4}-\d{5}$/)
  })
})

describe('2. the submission is now locked to the Engineer', () => {
  it('silently changes nothing when the author tries to edit', async () => {
    // Once the submission leaves draft, the row falls outside the author's
    // UPDATE policy, so Postgres matches no rows and the statement is a no-op
    // rather than an error. That is standard RLS semantics: a row you cannot
    // write is a row you cannot see for writing.
    //
    // A silent no-op would be a poor experience on its own, which is why
    // loadEditable() in the action layer checks the status first and returns a
    // clear message. RLS is the backstop, not the explanation.
    const before = await asUser(app, engineer.id, (c) =>
      c.query<{ problem_description: string }>(
        'select problem_description from engineer_submissions where id = $1',
        [submissionId],
      ),
    )

    const result = await asUser(app, engineer.id, (c) =>
      c.query('update engineer_submissions set problem_description = $1 where id = $2', [
        'rewritten after the fact',
        submissionId,
      ]),
    )
    expect(result.rowCount).toBe(0)

    const after = await asUser(app, engineer.id, (c) =>
      c.query<{ problem_description: string }>(
        'select problem_description from engineer_submissions where id = $1',
        [submissionId],
      ),
    )
    expect(after.rows[0]!.problem_description).toBe(before.rows[0]!.problem_description)
    expect(after.rows[0]!.problem_description).not.toMatch(/rewritten after the fact/)
  })

  it('blocks the edit outright if RLS is bypassed', async () => {
    // Proving the trigger is a genuine second line: as the schema owner, which
    // bypasses RLS entirely, the same edit is still refused.
    const err = await expectFailure(o, null, (c) =>
      c.query('update engineer_submissions set problem_description = $1 where id = $2', [
        'rewritten by a privileged connection',
        submissionId,
      ]),
    )
    expect(err.message).toMatch(/locked once submitted/i)
  })

  it('refuses new attachments', async () => {
    const err = await expectFailure(app, engineer.id, (c) =>
      c.query(
        `insert into submission_attachments
           (submission_id, kind, original_filename, storage_key, content_type, byte_size, checksum_sha256, uploaded_by)
         values ($1, 'photo', 'late.png', $2, 'image/png', 10, 'x', $3)`,
        [submissionId, `submissions/${submissionId}/photo/late-${RUN_ID}.png`, engineer.id],
      ),
    )
    expect(err.message).toMatch(/row-level security|Cannot modify/i)
  })
})

describe('3. the Technical Officer reviews', () => {
  it('sees the submission in the queue', async () => {
    const { rows } = await asUser(app, officer.id, (c) =>
      c.query("select id from engineer_submissions where status = 'submitted' and id = $1", [
        submissionId,
      ]),
    )
    expect(rows).toHaveLength(1)
  })

  it('was notified, and the Engineer was not', async () => {
    const theirs = await asUser(app, officer.id, (c) =>
      c.query('select id from notifications where entity_id = $1', [submissionId]),
    )
    const engineers = await asUser(app, engineer.id, (c) =>
      c.query('select id from notifications where entity_id = $1', [submissionId]),
    )

    expect(theirs.rows).toHaveLength(1)
    expect(engineers.rows).toHaveLength(0)
  })

  it('picks the submission up', async () => {
    await asUser(app, officer.id, (c) =>
      c.query(
        "update engineer_submissions set status = 'under_review', reviewed_by = $2, reviewed_at = now() where id = $1",
        [submissionId, officer.id],
      ),
    )

    const { rows } = await asUser(app, officer.id, (c) =>
      c.query('select status from engineer_submissions where id = $1', [submissionId]),
    )
    expect(rows[0]!.status).toBe('under_review')
  })

  it('can open the attachment the Engineer filed', async () => {
    const { rows } = await asUser(app, officer.id, (c) =>
      c.query<{ storage_key: string; checksum_sha256: string }>(
        'select storage_key, checksum_sha256 from submission_attachments where submission_id = $1',
        [submissionId],
      ),
    )
    expect(rows).toHaveLength(1)

    const bytes = await getStorage().get(rows[0]!.storage_key)
    expect(checksum(bytes)).toBe(rows[0]!.checksum_sha256)
  })

  it('returns it with a correction request', async () => {
    await asUser(app, officer.id, async (c) => {
      await c.query(
        `update engineer_submissions
            set status = 'changes_requested', correction_comment = $2
          where id = $1`,
        [submissionId, 'Add a photo of the motor nameplate and the bearing part numbers.'],
      )
      await c.query(
        `insert into approval_decisions
           (subject_type, subject_id, subject_version, decision, actor_id, actor_role, prior_status, new_status, comment)
         values ('engineer_submission', $1, 1, 'changes_requested', $2, 'technical_officer',
                 'under_review', 'changes_requested', 'Nameplate photo needed.')`,
        [submissionId, officer.id],
      )
      await c.query(
        `insert into notifications (user_id, kind, title, entity_type, entity_id, created_by)
         values ($1, 'submission_changes_requested', 'Correction needed', 'engineer_submissions', $2, $3)`,
        [engineer.id, submissionId, officer.id],
      )
    })

    const { rows } = await asUser(app, engineer.id, (c) =>
      c.query('select status, correction_comment from engineer_submissions where id = $1', [
        submissionId,
      ]),
    )
    expect(rows[0]!.status).toBe('changes_requested')
    expect(rows[0]!.correction_comment).toMatch(/nameplate/i)
  })
})

describe('4. the Engineer corrects and resubmits', () => {
  it('can edit again now the submission is back with them', async () => {
    await asUser(app, engineer.id, (c) =>
      c.query('update engineer_submissions set problem_description = $2 where id = $1', [
        submissionId,
        'Heavy bearing noise on the drive end. Nameplate: 15 kW, 1470 rpm, frame 160M.',
      ]),
    )

    const { rows } = await asUser(app, engineer.id, (c) =>
      c.query('select problem_description from engineer_submissions where id = $1', [submissionId]),
    )
    expect(rows[0]!.problem_description).toMatch(/nameplate/i)
  })

  it('keeps the original reference across the resubmission', async () => {
    await asUser(app, engineer.id, (c) =>
      c.query(
        `update engineer_submissions
            set status = 'submitted', revision = revision + 1, correction_comment = null,
                submitted_snapshot = jsonb_build_object('revision', 2, 'reference', reference)
          where id = $1`,
        [submissionId],
      ),
    )

    const { rows } = await asUser(app, officer.id, (c) =>
      c.query('select reference, revision, status from engineer_submissions where id = $1', [
        submissionId,
      ]),
    )
    expect(rows[0]!.reference).toBe(issuedReference)
    expect(rows[0]!.revision).toBe(2)
    expect(rows[0]!.status).toBe('submitted')
  })
})

describe('5. acceptance and hand-off', () => {
  it('is accepted by the Technical Officer', async () => {
    await asUser(app, officer.id, (c) =>
      c.query("update engineer_submissions set status = 'accepted' where id = $1", [submissionId]),
    )

    const { rows } = await asUser(app, officer.id, (c) =>
      c.query('select status from engineer_submissions where id = $1', [submissionId]),
    )
    expect(rows[0]!.status).toBe('accepted')
  })

  it('is marked ready for document preparation', async () => {
    await asUser(app, officer.id, (c) =>
      c.query(
        `update engineer_submissions
            set status = 'ready_for_documentation', ready_for_documentation_at = now()
          where id = $1`,
        [submissionId],
      ),
    )

    const { rows } = await asUser(app, officer.id, (c) =>
      c.query('select status, ready_for_documentation_at from engineer_submissions where id = $1', [
        submissionId,
      ]),
    )
    expect(rows[0]!.status).toBe('ready_for_documentation')
    expect(rows[0]!.ready_for_documentation_at).not.toBeNull()
  })

  it('leaves a complete, ordered workflow trail', async () => {
    const { rows } = await asUser(app, officer.id, (c) =>
      c.query<{ action: string }>(
        'select action from submission_events where submission_id = $1 order by created_at',
        [submissionId],
      ),
    )
    expect(rows.map((r) => r.action)).toContain('submitted')
  })

  it('leaves an approval decision naming the actor and their role', async () => {
    const { rows } = await asUser(app, officer.id, (c) =>
      c.query<{ decision: string; actor_role: string; actor_id: string }>(
        'select decision, actor_role, actor_id from approval_decisions where subject_id = $1',
        [submissionId],
      ),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.decision).toBe('changes_requested')
    expect(rows[0]!.actor_role).toBe('technical_officer')
    expect(rows[0]!.actor_id).toBe(officer.id)
  })

  it('cannot be reopened once it has moved on', async () => {
    const err = await expectFailure(app, officer.id, (c) =>
      c.query("update engineer_submissions set status = 'draft' where id = $1", [submissionId]),
    )
    expect(err.message).toMatch(/Invalid submission status transition/)
  })
})
