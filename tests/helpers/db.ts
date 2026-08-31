import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

/**
 * Test harness for the database-level security rules.
 *
 * Two connections, deliberately:
 *   owner() — the schema owner, used to arrange fixtures. Bypasses RLS.
 *   asUser() — the application role, which is what the running platform uses.
 *              Every statement it issues is subject to RLS, so these tests
 *              exercise the same path a real request takes.
 *
 * Fixtures are namespaced with a random suffix and torn down afterwards, so a
 * failed run cannot poison the next one.
 */

export const RUN_ID = randomUUID().slice(0, 8)

export async function owner(): Promise<Client> {
  const url = process.env.DATABASE_ADMIN_URL
  if (!url) throw new Error('DATABASE_ADMIN_URL must be set to run the database tests')
  const c = new Client({ connectionString: url })
  await c.connect()
  return c
}

export async function appClient(): Promise<Client> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL must be set to run the database tests')
  const c = new Client({ connectionString: url })
  await c.connect()
  return c
}

/**
 * Runs statements as a given user, exactly as the application does: one
 * transaction, identity declared with a transaction-local setting.
 */
export async function asUser<T>(
  client: Client,
  userId: string | null,
  fn: (c: Client) => Promise<T>,
): Promise<T> {
  await client.query('begin')
  try {
    if (userId) {
      await client.query("select set_config('app.user_id', $1, true)", [userId])
    }
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => undefined)
    throw err
  }
}

/** As above, but expects the body to fail and returns the error. */
export async function expectFailure(
  client: Client,
  userId: string | null,
  fn: (c: Client) => Promise<unknown>,
): Promise<{ code?: string; message: string }> {
  try {
    await asUser(client, userId, fn)
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return { code: e.code, message: e.message ?? String(err) }
  }
  throw new Error('Expected the statement to be rejected, but it succeeded')
}

export type Role = 'engineer' | 'technical_officer' | 'director' | 'administrator'

export async function createUser(
  o: Client,
  label: string,
  roles: Role[],
): Promise<{ id: string; email: string }> {
  const email = `${label}.${RUN_ID}@test.hagroup.local`
  const { rows } = await o.query<{ id: string }>(
    `insert into profiles (email, full_name, password_hash, must_change_password, is_active)
     values ($1, $2, 'scrypt$1$1$1$AA$AA', false, true) returning id`,
    [email, `Test ${label}`],
  )
  const id = rows[0]!.id

  for (const role of roles) {
    await o.query('insert into user_roles (user_id, role) values ($1, $2)', [id, role])
  }
  return { id, email }
}

export async function createClientRecord(o: Client, name: string): Promise<string> {
  const { rows } = await o.query<{ id: string }>(
    'insert into clients (legal_name, country) values ($1, $2) returning id',
    [`${name} ${RUN_ID}`, 'Tanzania'],
  )
  return rows[0]!.id
}

export async function createProject(o: Client, clientId: string, name: string): Promise<string> {
  const { rows } = await o.query<{ id: string }>(
    'insert into projects (client_id, name, reference, status) values ($1, $2, $3, $4) returning id',
    [clientId, name, `${name}-${RUN_ID}`, 'active'],
  )
  return rows[0]!.id
}

export async function assignToProject(o: Client, projectId: string, userId: string) {
  await o.query('insert into project_members (project_id, user_id) values ($1, $2)', [
    projectId,
    userId,
  ])
}

export async function createSubmission(
  o: Client,
  opts: { projectId: string; clientId: string; userId: string; status?: string; title?: string },
): Promise<string> {
  const { rows } = await o.query<{ id: string }>(
    `insert into engineer_submissions
       (project_id, client_id, submitted_by, title, problem_description, recommended_work, status)
     values ($1, $2, $3, $4, 'Test problem description', 'Test recommended work', $5)
     returning id`,
    [
      opts.projectId,
      opts.clientId,
      opts.userId,
      opts.title ?? `Test submission ${RUN_ID}`,
      opts.status ?? 'draft',
    ],
  )
  return rows[0]!.id
}

/**
 * Removes everything this run created, in dependency order.
 *
 * Best-effort by design. Append-only tables (audit_log, internal_references)
 * cannot be cleaned up at all, and a profile that has issued a reference or
 * written an audit record cannot be deleted either: the FK would set those
 * columns to null, which is an UPDATE, which app.deny_mutation() rejects for
 * every role.
 *
 * That is the intended production behaviour — accounts are deactivated, never
 * deleted, precisely so the trail stays attributable — so a failure here is
 * tolerated rather than treated as a broken test.
 */
export async function cleanup(o: Client) {
  const attempt = async (sql: string, params: unknown[] = []) => {
    try {
      await o.query(sql, params)
    } catch {
      // Blocked by an append-only guarantee. Expected for some fixtures.
    }
  }

  await attempt(
    `delete from engineer_submissions where id in (
       select es.id from engineer_submissions es
       join profiles p on p.id = es.submitted_by
       where p.email like $1)`,
    [`%.${RUN_ID}@test.hagroup.local`],
  )
  await attempt('delete from projects where reference like $1', [`%-${RUN_ID}`])
  await attempt('delete from clients where legal_name like $1', [`%${RUN_ID}`])
  await attempt('delete from profiles where email like $1', [
    `%.${RUN_ID}@test.hagroup.local`,
  ])
  await attempt('delete from numbering_rules where prefix = $1', [`T${RUN_ID.slice(0, 3)}`])
}
