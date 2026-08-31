/**
 * Creates the database and the two Postgres roles the platform needs.
 *
 * Run once, as a superuser:  npm run db:bootstrap
 *
 *   hagroup_owner — owns the schema. Used by migrations only.
 *   hagroup_app   — the application's runtime identity. Deliberately NOT a
 *                   superuser and explicitly NOBYPASSRLS, because a role with
 *                   either attribute silently ignores every Row Level Security
 *                   policy in the system.
 *
 * On Neon, roles and the database are created through the Neon console or API
 * instead; the GRANTs at the end of this script still apply and are re-run
 * safely by the migration.
 */
import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: '.env.local', quiet: true })

function parse(url: string) {
  const u = new URL(url)
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  }
}

async function main() {
  const superUrl = process.env.DATABASE_SUPERUSER_URL
  const adminUrl = process.env.DATABASE_ADMIN_URL
  const appUrl = process.env.DATABASE_URL

  if (!superUrl || !adminUrl || !appUrl) {
    throw new Error(
      'DATABASE_SUPERUSER_URL, DATABASE_ADMIN_URL and DATABASE_URL must all be set in .env.local',
    )
  }

  const owner = parse(adminUrl)
  const app = parse(appUrl)

  if (owner.database !== app.database) {
    throw new Error('DATABASE_ADMIN_URL and DATABASE_URL must point at the same database')
  }
  if (!owner.password || !app.password) {
    throw new Error('Both database roles must have a password set in .env.local')
  }

  const db = owner.database
  const su = new Client({ connectionString: superUrl })
  await su.connect()

  try {
    // Roles first — the database is created owned by hagroup_owner.
    for (const role of [owner, app]) {
      const { rows } = await su.query('select 1 from pg_roles where rolname = $1', [role.user])
      if (rows.length === 0) {
        await su.query(
          `create role ${quoteIdent(role.user)} with login password ${quoteLiteral(role.password)} nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
        )
        console.log(`created role ${role.user}`)
      } else {
        await su.query(
          `alter role ${quoteIdent(role.user)} with login password ${quoteLiteral(role.password)} nosuperuser nobypassrls`,
        )
        console.log(`updated role ${role.user}`)
      }
    }

    const { rows: dbRows } = await su.query('select 1 from pg_database where datname = $1', [db])
    if (dbRows.length === 0) {
      await su.query(`create database ${quoteIdent(db)} owner ${quoteIdent(owner.user)}`)
      console.log(`created database ${db}`)
    } else {
      console.log(`database ${db} already exists`)
    }
  } finally {
    await su.end()
  }

  // Connect to the new database as superuser to hand out schema privileges.
  const targetUrl = new URL(superUrl)
  targetUrl.pathname = `/${db}`
  const dbSuper = new Client({ connectionString: targetUrl.toString() })
  await dbSuper.connect()
  try {
    await dbSuper.query(`grant all on schema public to ${quoteIdent(owner.user)}`)
    await dbSuper.query(`grant usage on schema public to ${quoteIdent(app.user)}`)
    await dbSuper.query(`alter schema public owner to ${quoteIdent(owner.user)}`)
    console.log('granted schema privileges')
  } finally {
    await dbSuper.end()
  }

  console.log('\nbootstrap complete. Next: npm run db:migrate')
}

function quoteIdent(v: string) {
  return `"${v.replace(/"/g, '""')}"`
}
function quoteLiteral(v: string) {
  return `'${v.replace(/'/g, "''")}'`
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
