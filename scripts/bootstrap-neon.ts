/**
 * Bootstraps the two Postgres roles on a Neon database.
 *
 *   npm run db:bootstrap:neon
 *
 * Neon has no superuser and creates the database for you, so scripts/bootstrap.ts
 * — which creates a database and needs SUPERUSER — does not apply. What is left
 * is the part that matters: making sure the application connects as a role that
 * cannot bypass Row Level Security.
 *
 * Run this as Neon's own owner role (usually `neondb_owner`), supplied as
 * DATABASE_SUPERUSER_URL. It is idempotent — running it again rotates the two
 * passwords to whatever is currently in the environment and re-applies grants.
 *
 * Why two roles rather than one:
 *
 *   hagroup_owner — owns every table. Used by migrations only, never by the app.
 *   hagroup_app   — the application's runtime identity. NOSUPERUSER and
 *                   NOBYPASSRLS, and deliberately NOT the table owner, because
 *                   a table's owner is exempt from its own RLS policies unless
 *                   FORCE ROW LEVEL SECURITY is set.
 *
 * The migrations grant table and column privileges to `hagroup_app` by that
 * literal name, so the role must exist before `npm run db:migrate` runs.
 */
import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: '.env.local', quiet: true })

function parse(url: string, label: string) {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error(`${label} is not a valid connection URL`)
  }
  const user = decodeURIComponent(u.username)
  const password = decodeURIComponent(u.password)
  const database = u.pathname.replace(/^\//, '')
  if (!user) throw new Error(`${label} has no username`)
  if (!password) throw new Error(`${label} has no password`)
  if (!database) throw new Error(`${label} has no database name`)
  return { user, password, database, host: u.hostname }
}

function quoteIdent(v: string) {
  return `"${v.replace(/"/g, '""')}"`
}
function quoteLiteral(v: string) {
  return `'${v.replace(/'/g, "''")}'`
}

async function main() {
  const superUrl = process.env.DATABASE_SUPERUSER_URL
  const adminUrl = process.env.DATABASE_ADMIN_URL
  const appUrl = process.env.DATABASE_URL

  if (!superUrl || !adminUrl || !appUrl) {
    throw new Error(
      'DATABASE_SUPERUSER_URL (your Neon owner role), DATABASE_ADMIN_URL and ' +
        'DATABASE_URL must all be set.',
    )
  }

  const owner = parse(adminUrl, 'DATABASE_ADMIN_URL')
  const app = parse(appUrl, 'DATABASE_URL')
  const su = parse(superUrl, 'DATABASE_SUPERUSER_URL')

  if (owner.database !== app.database || owner.database !== su.database) {
    throw new Error('All three connection URLs must point at the same database')
  }
  // Neon exposes each branch on two hostnames: the direct endpoint and the
  // "-pooler" endpoint in front of PgBouncer. Migrations must use the direct
  // one (DDL and advisory locks need a session), while the running application
  // should use the pooler. They are the same database, so compare the endpoint
  // rather than the hostname.
  const endpoint = (host: string) => host.replace('-pooler.', '.')
  if (endpoint(owner.host) !== endpoint(su.host) || endpoint(owner.host) !== endpoint(app.host)) {
    throw new Error('All three connection URLs must point at the same database endpoint')
  }
  if (owner.user === app.user) {
    throw new Error(
      'DATABASE_ADMIN_URL and DATABASE_URL must use different roles. Sharing one ' +
        'role would make the application the table owner, which exempts it from ' +
        'Row Level Security.',
    )
  }
  if (app.user === su.user) {
    throw new Error(
      `DATABASE_URL must not connect as "${su.user}" — Neon's owner role is exempt ` +
        'from Row Level Security on the tables it owns.',
    )
  }

  const client = new Client({ connectionString: superUrl })
  await client.connect()

  try {
    for (const role of [owner, app]) {
      const { rows } = await client.query('select 1 from pg_roles where rolname = $1', [role.user])

      if (rows.length === 0) {
        // Stating the attributes explicitly rather than relying on defaults, so
        // that a future Postgres changing a default fails loudly here.
        await client.query(
          `create role ${quoteIdent(role.user)} with login password ${quoteLiteral(role.password)} nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
        )
        console.log(`created role ${role.user}`)
      } else {
        // Re-asserting NOSUPERUSER or NOBYPASSRLS requires a true superuser even
        // when it changes nothing, and Neon does not give you one. The password
        // is the only part that needs rotating on a repeat run; the attributes
        // are verified below instead of being rewritten.
        await client.query(
          `alter role ${quoteIdent(role.user)} with login password ${quoteLiteral(role.password)}`,
        )
        console.log(`updated role ${role.user}`)
      }
    }

    // On a self-hosted install hagroup_owner owns the database and gets these
    // implicitly. On Neon the database belongs to Neon's own role, so the
    // privileges have to be granted: the migrations create the `app` schema,
    // and CREATE on a schema is a database-level privilege.
    await client.query(
      `grant create, connect, temporary on database ${quoteIdent(owner.database)} to ${quoteIdent(owner.user)}`,
    )
    await client.query(
      `grant connect on database ${quoteIdent(app.database)} to ${quoteIdent(app.user)}`,
    )

    // The owner role needs to create objects; the app role only needs to reach
    // them. Table and column privileges come from the migrations.
    await client.query(`grant all on schema public to ${quoteIdent(owner.user)}`)
    await client.query(`grant usage on schema public to ${quoteIdent(app.user)}`)

    // Neon's owner role must be able to hand the schema over.
    await client.query(`grant ${quoteIdent(owner.user)} to ${quoteIdent(su.user)}`)
    await client.query(`alter schema public owner to ${quoteIdent(owner.user)}`)
    console.log('granted schema privileges')

    // Verify rather than assume: this is the one property the entire
    // authorisation model depends on.
    const { rows: check } = await client.query<{
      rolname: string
      rolsuper: boolean
      rolbypassrls: boolean
    }>('select rolname, rolsuper, rolbypassrls from pg_roles where rolname = any($1::text[])', [
      [app.user, owner.user],
    ])

    const runtime = check.find((r) => r.rolname === app.user)
    if (!runtime) throw new Error(`Role ${app.user} was not created`)
    if (runtime.rolsuper || runtime.rolbypassrls) {
      throw new Error(
        `Role ${app.user} can bypass Row Level Security (superuser=${runtime.rolsuper}, ` +
          `bypassrls=${runtime.rolbypassrls}). Do not deploy.`,
      )
    }
    console.log(`verified ${app.user} is NOSUPERUSER and NOBYPASSRLS`)
  } finally {
    await client.end()
  }

  console.log('\nbootstrap complete. Next: npm run db:migrate, then npm run db:seed')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
