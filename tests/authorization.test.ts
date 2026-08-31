import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import {
  appClient,
  asUser,
  RUN_ID,
  assignToProject,
  cleanup,
  createClientRecord,
  createProject,
  createSubmission,
  createUser,
  expectFailure,
  owner,
} from './helpers/db'

/**
 * Authorisation, tested at the database boundary.
 *
 * These assertions matter more than any equivalent test of the permission
 * matrix: they prove that access control holds even if the application layer
 * is wrong or bypassed entirely.
 */

let o: Client
let app: Client

let engineerA: { id: string; email: string }
let engineerB: { id: string; email: string }
let officer: { id: string; email: string }
let director: { id: string; email: string }
let admin: { id: string; email: string }

let clientId: string
let projectA: string
let projectB: string
let submissionA: string

beforeAll(async () => {
  o = await owner()
  app = await appClient()

  engineerA = await createUser(o, 'engA', ['engineer'])
  engineerB = await createUser(o, 'engB', ['engineer'])
  officer = await createUser(o, 'officer', ['technical_officer'])
  director = await createUser(o, 'director', ['director'])
  admin = await createUser(o, 'admin', ['administrator'])

  clientId = await createClientRecord(o, 'Authz Client')
  projectA = await createProject(o, clientId, 'ProjA')
  projectB = await createProject(o, clientId, 'ProjB')

  await assignToProject(o, projectA, engineerA.id)
  await assignToProject(o, projectB, engineerB.id)

  submissionA = await createSubmission(o, {
    projectId: projectA,
    clientId,
    userId: engineerA.id,
    status: 'submitted',
  })
})

afterAll(async () => {
  await cleanup(o)
  await o.end()
  await app.end()
})

describe('unauthenticated access', () => {
  it('sees no profiles at all', async () => {
    const { rows } = await asUser(app, null, (c) => c.query('select id from profiles'))
    expect(rows).toHaveLength(0)
  })

  it('sees no clients, projects or submissions', async () => {
    const result = await asUser(app, null, async (c) => ({
      clients: (await c.query('select id from clients')).rows.length,
      projects: (await c.query('select id from projects')).rows.length,
      submissions: (await c.query('select id from engineer_submissions')).rows.length,
    }))
    expect(result).toEqual({ clients: 0, projects: 0, submissions: 0 })
  })
})

describe('password material', () => {
  it('is not readable by the application role at all', async () => {
    const err = await expectFailure(app, admin.id, (c) =>
      c.query('select password_hash from profiles limit 1'),
    )
    // 42501 — insufficient_privilege. A column-level grant, not a policy.
    expect(err.code).toBe('42501')
  })
})

describe('engineer isolation', () => {
  it('sees only projects they are assigned to', async () => {
    const { rows } = await asUser(app, engineerA.id, (c) => c.query('select id from projects'))
    expect(rows.map((r) => r.id)).toEqual([projectA])
  })

  it('cannot see another engineer’s submission', async () => {
    const otherSubmission = await createSubmission(o, {
      projectId: projectB,
      clientId,
      userId: engineerB.id,
      status: 'submitted',
    })

    const { rows } = await asUser(app, engineerA.id, (c) =>
      c.query('select id from engineer_submissions where id = $1', [otherSubmission]),
    )
    expect(rows).toHaveLength(0)
  })

  it('cannot file against a project they are not assigned to', async () => {
    const err = await expectFailure(app, engineerA.id, (c) =>
      c.query(
        `insert into engineer_submissions
           (project_id, client_id, submitted_by, title, problem_description, recommended_work)
         values ($1, $2, $3, 'Forged', 'x', 'y')`,
        [projectB, clientId, engineerA.id],
      ),
    )
    expect(err.message).toMatch(/row-level security/i)
  })

  it('cannot file in another engineer’s name', async () => {
    const err = await expectFailure(app, engineerA.id, (c) =>
      c.query(
        `insert into engineer_submissions
           (project_id, client_id, submitted_by, title, problem_description, recommended_work)
         values ($1, $2, $3, 'Impersonated', 'x', 'y')`,
        [projectA, clientId, engineerB.id],
      ),
    )
    expect(err.message).toMatch(/row-level security/i)
  })

  it('cannot create a client', async () => {
    const err = await expectFailure(app, engineerA.id, (c) =>
      c.query('insert into clients (legal_name) values ($1)', [`Sneaky ${Date.now()}`]),
    )
    expect(err.message).toMatch(/row-level security/i)
  })

  it('cannot grant themselves a role', async () => {
    const err = await expectFailure(app, engineerA.id, (c) =>
      c.query('insert into user_roles (user_id, role) values ($1, $2)', [
        engineerA.id,
        'administrator',
      ]),
    )
    expect(err.message).toMatch(/row-level security/i)
  })

  it('cannot read the audit trail', async () => {
    const { rows } = await asUser(app, engineerA.id, (c) =>
      c.query('select id from audit_log limit 5'),
    )
    expect(rows).toHaveLength(0)
  })
})

describe('technical officer', () => {
  it('sees every submission, including ones from projects they are not on', async () => {
    const { rows } = await asUser(app, officer.id, (c) =>
      c.query('select id from engineer_submissions where id = $1', [submissionA]),
    )
    expect(rows).toHaveLength(1)
  })

  it('can create a client', async () => {
    const { rows } = await asUser(app, officer.id, (c) =>
      c.query('insert into clients (legal_name) values ($1) returning id', [
        `Officer Client ${Date.now()}`,
      ]),
    )
    expect(rows).toHaveLength(1)
    await o.query('delete from clients where id = $1', [rows[0]!.id])
  })

  it('cannot change company configuration', async () => {
    const err = await expectFailure(app, officer.id, (c) =>
      c.query("insert into tax_rules (code, label, rate_percent) values ('X', 'X', 1)"),
    )
    expect(err.message).toMatch(/row-level security/i)
  })

  it('cannot see unapproved configuration drafts', async () => {
    const { rows: draftId } = await o.query<{ id: string }>(
      `insert into tax_rules (code, label, rate_percent, state)
       values ($1, 'Draft only', 5, 'draft') returning id`,
      [`T${Date.now()}`.slice(0, 20)],
    )

    const { rows } = await asUser(app, officer.id, (c) =>
      c.query('select id from tax_rules where id = $1', [draftId[0]!.id]),
    )
    expect(rows).toHaveLength(0)

    await o.query('delete from tax_rules where id = $1', [draftId[0]!.id])
  })
})

describe('director and administrator', () => {
  it('director can read the audit trail', async () => {
    await o.query("insert into audit_log (action, entity_type) values ('test.read', 'test')")
    const { rows } = await asUser(app, director.id, (c) =>
      c.query("select id from audit_log where action = 'test.read'"),
    )
    expect(rows.length).toBeGreaterThan(0)
    await o.query("delete from audit_log where action = 'test.read'").catch(() => undefined)
  })

  it('director cannot manage users', async () => {
    const err = await expectFailure(app, director.id, (c) =>
      c.query('insert into user_roles (user_id, role) values ($1, $2)', [
        engineerA.id,
        'director',
      ]),
    )
    expect(err.message).toMatch(/row-level security/i)
  })

  it('administrator can see configuration drafts', async () => {
    const { rows } = await asUser(app, admin.id, (c) =>
      c.query("select id from legal_entities where state = 'draft'"),
    )
    expect(rows.length).toBeGreaterThan(0)
  })
})

describe('notification privacy', () => {
  it('a user cannot read another user’s notifications', async () => {
    await o.query(
      `insert into notifications (user_id, kind, title)
       values ($1, 'submission_submitted', 'Private to engineer A')`,
      [engineerA.id],
    )

    const mine = await asUser(app, engineerA.id, (c) =>
      c.query("select id from notifications where title = 'Private to engineer A'"),
    )
    const theirs = await asUser(app, engineerB.id, (c) =>
      c.query("select id from notifications where title = 'Private to engineer A'"),
    )

    expect(mine.rows).toHaveLength(1)
    expect(theirs.rows).toHaveLength(0)

    await o.query("delete from notifications where title = 'Private to engineer A'")
  })
})

describe('deactivated accounts', () => {
  it('lose all access immediately, even with a valid identity', async () => {
    const suspended = await createUser(o, 'suspended', ['technical_officer'])
    await o.query('update profiles set is_active = false where id = $1', [suspended.id])

    const { rows } = await asUser(app, suspended.id, (c) =>
      c.query('select id from engineer_submissions'),
    )
    expect(rows).toHaveLength(0)
  })
})

describe('session resolution', () => {
  /**
   * Regression: resolve_session originally returned public.app_role[]. The
   * node-postgres driver has no parser for a custom enum array, so the roles
   * arrived in Node as the raw literal '{administrator}' — a string — and every
   * permission check that called .some() on it threw. The function now returns
   * text[], which the driver parses natively.
   */
  it('returns roles as a real array, not a Postgres array literal', async () => {
    const tokenHash = `test-token-${RUN_ID}`
    await o.query(
      `insert into sessions (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '1 hour')`,
      [officer.id, tokenHash],
    )

    const { rows } = await asUser(app, null, (c) =>
      c.query<{ roles: unknown; user_id: string }>('select * from app.resolve_session($1)', [
        tokenHash,
      ]),
    )

    expect(rows).toHaveLength(1)
    expect(Array.isArray(rows[0]!.roles)).toBe(true)
    expect(rows[0]!.roles).toEqual(['technical_officer'])
  })

  it('returns nothing for an expired session', async () => {
    const tokenHash = `expired-token-${RUN_ID}`
    await o.query(
      `insert into sessions (user_id, token_hash, expires_at)
       values ($1, $2, now() - interval '1 hour')`,
      [officer.id, tokenHash],
    )

    const { rows } = await asUser(app, null, (c) =>
      c.query('select * from app.resolve_session($1)', [tokenHash]),
    )
    expect(rows).toHaveLength(0)
  })

  it('returns nothing for a revoked session', async () => {
    const tokenHash = `revoked-token-${RUN_ID}`
    await o.query(
      `insert into sessions (user_id, token_hash, expires_at, revoked_at)
       values ($1, $2, now() + interval '1 hour', now())`,
      [officer.id, tokenHash],
    )

    const { rows } = await asUser(app, null, (c) =>
      c.query('select * from app.resolve_session($1)', [tokenHash]),
    )
    expect(rows).toHaveLength(0)
  })

  it('returns nothing once the account is deactivated', async () => {
    const dormant = await createUser(o, 'dormant', ['engineer'])
    const tokenHash = `dormant-token-${RUN_ID}`
    await o.query(
      `insert into sessions (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '1 hour')`,
      [dormant.id, tokenHash],
    )
    await o.query('update profiles set is_active = false where id = $1', [dormant.id])

    const { rows } = await asUser(app, null, (c) =>
      c.query('select * from app.resolve_session($1)', [tokenHash]),
    )
    expect(rows).toHaveLength(0)
  })

  it('is not readable through the sessions table directly', async () => {
    // The application role holds no grant on sessions at all.
    const err = await expectFailure(app, officer.id, (c) =>
      c.query('select token_hash from sessions limit 1'),
    )
    expect(err.code).toBe('42501')
  })
})

describe('administrator user creation', () => {
  /**
   * Regression: INSERT on profiles was granted column-by-column. Postgres
   * checks column privileges against every column named in the statement,
   * including those set to DEFAULT, so the ORM's insert was refused outright.
   * INSERT is now table-level; SELECT stays column-scoped so the password hash
   * remains unreadable.
   */
  it('can create a profile with a password hash', async () => {
    const email = `created.${RUN_ID}@test.hagroup.local`

    const { rows } = await asUser(app, admin.id, (c) =>
      c.query<{ id: string }>(
        `insert into profiles
           (email, full_name, phone, job_title, password_hash, must_change_password, is_active, created_by)
         values ($1, 'Created By Admin', null, 'Engineer', 'scrypt$1$1$1$AA$AA', true, true, $2)
         returning id`,
        [email, admin.id],
      ),
    )

    expect(rows).toHaveLength(1)
  })

  it('still cannot read back the hash it just wrote', async () => {
    const err = await expectFailure(app, admin.id, (c) =>
      c.query('select password_hash from profiles where id = $1', [admin.id]),
    )
    expect(err.code).toBe('42501')
  })

  it('cannot change a password through a plain update', async () => {
    // password_hash is excluded from the UPDATE grant, so the only route is
    // app.set_password(), which checks authorisation itself.
    const err = await expectFailure(app, admin.id, (c) =>
      c.query("update profiles set password_hash = 'forged' where id = $1", [engineerA.id]),
    )
    expect(err.code).toBe('42501')
  })

  it('an engineer cannot create a profile', async () => {
    const err = await expectFailure(app, engineerA.id, (c) =>
      c.query(
        `insert into profiles (email, full_name, password_hash)
         values ($1, 'Self Made', 'scrypt$1$1$1$AA$AA')`,
        [`selfmade.${RUN_ID}@test.hagroup.local`],
      ),
    )
    expect(err.message).toMatch(/row-level security/i)
  })
})
