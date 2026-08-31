import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import {
  appClient,
  asUser,
  assignToProject,
  cleanup,
  createClientRecord,
  createProject,
  createSubmission,
  createUser,
  expectFailure,
  owner,
  RUN_ID,
} from './helpers/db'

/**
 * Workflow integrity.
 *
 * Status transitions, content locking and audit immutability are enforced by
 * triggers, which no role can bypass — so these run as the schema owner in
 * places, to prove the guarantee holds even for the most privileged connection.
 */

let o: Client
let app: Client
let engineer: { id: string }
let officer: { id: string }
let clientId: string
let projectId: string

beforeAll(async () => {
  o = await owner()
  app = await appClient()

  engineer = await createUser(o, 'wfEng', ['engineer'])
  officer = await createUser(o, 'wfOfficer', ['technical_officer'])
  clientId = await createClientRecord(o, 'Workflow Client')
  projectId = await createProject(o, clientId, 'WfProj')
  await assignToProject(o, projectId, engineer.id)
})

afterAll(async () => {
  await cleanup(o)
  await o.end()
  await app.end()
})

async function fresh(status: string) {
  return createSubmission(o, { projectId, clientId, userId: engineer.id, status })
}

describe('status transitions', () => {
  const legal: Array<[string, string]> = [
    ['draft', 'submitted'],
    ['draft', 'cancelled'],
    ['submitted', 'under_review'],
    ['submitted', 'changes_requested'],
    ['submitted', 'accepted'],
    ['under_review', 'accepted'],
    ['under_review', 'changes_requested'],
    ['changes_requested', 'submitted'],
    ['accepted', 'ready_for_documentation'],
    ['ready_for_documentation', 'cancelled'],
  ]

  it.each(legal)('allows %s → %s', async (from, to) => {
    const id = await fresh(from)
    await o.query('update engineer_submissions set status = $1 where id = $2', [to, id])
    const { rows } = await o.query('select status from engineer_submissions where id = $1', [id])
    expect(rows[0]!.status).toBe(to)
  })

  const illegal: Array<[string, string]> = [
    // Skipping the review entirely.
    ['draft', 'accepted'],
    ['draft', 'ready_for_documentation'],
    ['draft', 'under_review'],
    // Reviving a closed record.
    ['cancelled', 'draft'],
    ['cancelled', 'submitted'],
    // Going backwards to an editable state without a correction request.
    ['accepted', 'submitted'],
    ['submitted', 'draft'],
    ['ready_for_documentation', 'accepted'],
  ]

  it.each(illegal)('rejects %s → %s', async (from, to) => {
    const id = await fresh(from)
    const err = await expectFailure(o, null, (c) =>
      c.query('update engineer_submissions set status = $1 where id = $2', [to, id]),
    )
    expect(err.message).toMatch(/Invalid submission status transition/)
  })
})

describe('submitted content is locked', () => {
  it('rejects an edit to the engineer’s own text once submitted', async () => {
    const id = await fresh('submitted')
    const err = await expectFailure(o, null, (c) =>
      c.query('update engineer_submissions set problem_description = $1 where id = $2', [
        'quietly rewritten',
        id,
      ]),
    )
    expect(err.message).toMatch(/locked once submitted/)
  })

  it('rejects reassigning authorship after submission', async () => {
    const id = await fresh('submitted')
    const err = await expectFailure(o, null, (c) =>
      c.query('update engineer_submissions set submitted_by = $1 where id = $2', [officer.id, id]),
    )
    expect(err.message).toMatch(/locked once submitted/)
  })

  it('still allows the Technical Officer to correct the project link', async () => {
    const id = await fresh('submitted')
    const otherProject = await createProject(o, clientId, 'WfProj2')

    await o.query('update engineer_submissions set project_id = $1 where id = $2', [
      otherProject,
      id,
    ])

    const { rows } = await o.query('select project_id from engineer_submissions where id = $1', [
      id,
    ])
    expect(rows[0]!.project_id).toBe(otherProject)
  })

  it('allows the engineer to edit again after a correction is requested', async () => {
    const id = await fresh('submitted')
    await o.query("update engineer_submissions set status = 'changes_requested' where id = $1", [
      id,
    ])

    await o.query('update engineer_submissions set problem_description = $1 where id = $2', [
      'corrected as asked',
      id,
    ])

    const { rows } = await o.query(
      'select problem_description from engineer_submissions where id = $1',
      [id],
    )
    expect(rows[0]!.problem_description).toBe('corrected as asked')
  })

  it('refuses to rewrite the filed snapshot', async () => {
    const id = await fresh('draft')
    await o.query(
      `update engineer_submissions
          set status = 'submitted', submitted_snapshot = '{"v":1}'::jsonb
        where id = $1`,
      [id],
    )

    const err = await expectFailure(o, null, (c) =>
      c.query('update engineer_submissions set submitted_snapshot = $1 where id = $2', [
        '{"v":"tampered"}',
        id,
      ]),
    )
    expect(err.message).toMatch(/submitted snapshot cannot be modified/)
  })
})

describe('attachments and measurements follow the parent', () => {
  it('cannot be added once the submission has been filed', async () => {
    const id = await fresh('submitted')
    const err = await expectFailure(o, null, (c) =>
      c.query(
        `insert into submission_measurements (submission_id, label, value, unit)
         values ($1, 'Late addition', 1, 'mm')`,
        [id],
      ),
    )
    expect(err.message).toMatch(/Cannot modify submission_measurements/)
  })

  it('can be added while still a draft', async () => {
    const id = await fresh('draft')
    await o.query(
      `insert into submission_measurements (submission_id, label, value, unit)
       values ($1, 'Shaft runout', 0.12, 'mm')`,
      [id],
    )
    const { rows } = await o.query(
      'select count(*)::int as n from submission_measurements where submission_id = $1',
      [id],
    )
    expect(rows[0]!.n).toBe(1)
  })
})

describe('audit log immutability', () => {
  it('cannot be updated, even by the schema owner', async () => {
    await o.query("insert into audit_log (action, entity_type) values ($1, 'test')", [
      `test.immutable.${RUN_ID}`,
    ])
    const err = await expectFailure(o, null, (c) =>
      c.query('update audit_log set action = $1 where action = $2', [
        'rewritten',
        `test.immutable.${RUN_ID}`,
      ]),
    )
    expect(err.message).toMatch(/append-only/)
  })

  it('cannot be deleted, even by the schema owner', async () => {
    const err = await expectFailure(o, null, (c) =>
      c.query('delete from audit_log where action = $1', [`test.immutable.${RUN_ID}`]),
    )
    expect(err.message).toMatch(/append-only/)
  })

  it('the application role holds no update or delete privilege', async () => {
    const { rows } = await o.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
       where table_name = 'audit_log' and grantee = 'hagroup_app'`,
    )
    const granted = rows.map((r) => r.privilege_type).sort()
    expect(granted).toEqual(['INSERT', 'SELECT'])
  })
})

describe('the application role cannot bypass RLS', () => {
  it('is neither a superuser nor BYPASSRLS', async () => {
    const { rows } = await o.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "select rolsuper, rolbypassrls from pg_roles where rolname = 'hagroup_app'",
    )
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
  })

  it('has row level security enabled on every business table', async () => {
    const { rows } = await o.query<{ relname: string }>(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relrowsecurity = false
        and c.relname not in ('_migrations')
    `)
    expect(rows.map((r) => r.relname)).toEqual([])
  })
})
