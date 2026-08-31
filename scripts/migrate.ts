/**
 * Applies every .sql file in ./drizzle in filename order, once, inside a
 * transaction, as the schema owner.
 *
 * A hand-rolled runner rather than drizzle-kit's own: this project mixes
 * generated table DDL with hand-written security SQL (roles, policies,
 * triggers, SECURITY DEFINER functions), and both have to be applied in a
 * single ordered sequence.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: '.env.local', quiet: true })

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle')

async function main() {
  const url = process.env.DATABASE_ADMIN_URL
  if (!url) throw new Error('DATABASE_ADMIN_URL must be set')

  const client = new Client({ connectionString: url })
  await client.connect()

  try {
    await client.query(`
      create table if not exists public._migrations (
        filename   text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      )
    `)

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const { rows } = await client.query<{ filename: string; checksum: string }>(
      'select filename, checksum from public._migrations',
    )
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]))

    let count = 0
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const previous = applied.get(file)

      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `Migration ${file} has changed since it was applied.\n` +
              'Applied migrations are immutable — add a new migration instead.',
          )
        }
        continue
      }

      process.stdout.write(`applying ${file} ... `)
      await client.query('begin')
      try {
        await client.query(sql)
        await client.query('insert into public._migrations (filename, checksum) values ($1, $2)', [
          file,
          checksum,
        ])
        await client.query('commit')
        console.log('ok')
        count += 1
      } catch (err) {
        await client.query('rollback')
        console.log('failed')
        throw err
      }
    }

    console.log(count === 0 ? 'database already up to date' : `applied ${count} migration(s)`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('\n' + (err instanceof Error ? err.message : String(err)))
  process.exit(1)
})
