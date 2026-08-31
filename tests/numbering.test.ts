import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { appClient, asUser, cleanup, createUser, expectFailure, owner, RUN_ID } from './helpers/db'

/**
 * Document reference allocation.
 *
 * The requirement is absolute: two people generating a document at the same
 * instant must never receive the same number. This is the test that proves the
 * advisory lock and the unique index actually deliver that, rather than
 * assuming a sequence "probably" works.
 */

let o: Client
let app: Client
let officer: { id: string }
const PREFIX = `T${RUN_ID.slice(0, 3)}`

beforeAll(async () => {
  o = await owner()
  app = await appClient()
  officer = await createUser(o, 'numOfficer', ['technical_officer'])

  // Clear any rule left behind by an interrupted run: only one approved rule
  // per document type is allowed, so a stale row would block this insert.
  await o.query("delete from numbering_rules where document_type = 'site_report'")

  // An approved rule must exist before any reference can be issued.
  await o.query(
    `insert into numbering_rules
       (document_type, pattern, prefix, sequence_padding, sequence_start, reset_period, state)
     values ('site_report', $1, $2, 4, 1, 'yearly', 'approved')`,
    ['TEST-' + RUN_ID + '-{SEQ}', PREFIX],
  )
})

afterAll(async () => {
  // internal_references is deliberately NOT cleaned up: it is append-only, and
  // the trigger refuses a delete even from the schema owner. Issued references
  // are namespaced with RUN_ID, so they never collide between runs. This is the
  // guarantee working, not an oversight.
  await o.query("delete from numbering_rules where document_type = 'site_report'")
  await cleanup(o)
  await o.end()
  await app.end()
})

describe('reference allocation', () => {
  it('issues sequential references', async () => {
    const first = await asUser(app, officer.id, (c) =>
      c.query<{ r: string }>("select app.issue_internal_reference('site_report') as r"),
    )
    const second = await asUser(app, officer.id, (c) =>
      c.query<{ r: string }>("select app.issue_internal_reference('site_report') as r"),
    )

    expect(first.rows[0]!.r).toMatch(/^TEST-.+-\d{4}$/)
    expect(second.rows[0]!.r).not.toBe(first.rows[0]!.r)

    const seqOf = (s: string) => Number(s.slice(-4))
    expect(seqOf(second.rows[0]!.r)).toBe(seqOf(first.rows[0]!.r) + 1)
  })

  it('never issues the same reference to concurrent callers', async () => {
    const CONCURRENCY = 12

    // Genuinely concurrent: separate connections, each in its own transaction,
    // all racing for the same counter.
    const clients = await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        const c = new Client({ connectionString: process.env.DATABASE_URL })
        await c.connect()
        return c
      }),
    )

    try {
      const results = await Promise.all(
        clients.map((c) =>
          asUser(c, officer.id, async (conn) => {
            const r = await conn.query<{ r: string }>(
              "select app.issue_internal_reference('site_report') as r",
            )
            return r.rows[0]!.r
          }),
        ),
      )

      const unique = new Set(results)
      expect(unique.size).toBe(CONCURRENCY)
    } finally {
      await Promise.all(clients.map((c) => c.end()))
    }
  })

  it('refuses to issue when no approved rule exists', async () => {
    const err = await expectFailure(app, officer.id, (c) =>
      c.query("select app.issue_internal_reference('export_invoice')"),
    )
    expect(err.message).toMatch(/No approved numbering rule/)
  })

  it('refuses to issue without an authenticated identity', async () => {
    const err = await expectFailure(app, null, (c) =>
      c.query("select app.issue_internal_reference('site_report')"),
    )
    expect(err.message).toMatch(/Not authenticated/)
  })

  it('will not accept a duplicate reference even if one is forced', async () => {
    const existing = await o.query<{ formatted: string; period_key: string }>(
      "select formatted, period_key from internal_references where document_type = 'site_report' limit 1",
    )
    const row = existing.rows[0]!

    const err = await expectFailure(o, null, (c) =>
      c.query(
        `insert into internal_references (document_type, period_key, sequence, formatted)
         values ('site_report', $1, 9999, $2)`,
        [row.period_key, row.formatted],
      ),
    )
    // 23505 — unique_violation. The index is the real guarantee.
    expect(err.code).toBe('23505')
  })
})

describe('submission references', () => {
  it('are issued without depending on approved configuration', async () => {
    // Deliberately independent of numbering_rules: an Engineer must be able to
    // file from site before an Administrator has approved anything.
    const { rows } = await asUser(app, officer.id, (c) =>
      c.query<{ r: string }>('select app.next_submission_reference() as r'),
    )
    expect(rows[0]!.r).toMatch(/^SUB-\d{4}-\d{5}$/)
  })

  it('are unique across concurrent callers', async () => {
    const clients = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const c = new Client({ connectionString: process.env.DATABASE_URL })
        await c.connect()
        return c
      }),
    )

    try {
      const results = await Promise.all(
        clients.map((c) =>
          asUser(c, officer.id, async (conn) => {
            const r = await conn.query<{ r: string }>('select app.next_submission_reference() as r')
            return r.rows[0]!.r
          }),
        ),
      )
      expect(new Set(results).size).toBe(8)
    } finally {
      await Promise.all(clients.map((c) => c.end()))
    }
  })
})
