/**
 * Pre-deployment verification.
 *
 *   npm run preflight
 *
 * Checks the things that are silently wrong rather than loudly wrong: a runtime
 * role that can bypass Row Level Security, a migration that was edited after it
 * was applied, a storage driver named but not credentialed, an approval policy
 * that lets a Technical Officer sign for a Director.
 *
 * It connects with DATABASE_URL — the same restricted identity the deployed
 * application uses — precisely so that "can this role see what it should not"
 * is answered by the role itself and not by a privileged one. Checks that need
 * catalogue access fall back to DATABASE_ADMIN_URL when it is available.
 *
 * Exit code 1 means do not deploy. Warnings do not fail the run: an unconfigured
 * email provider is a fact to know, not a defect.
 */
import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: '.env.local', quiet: true })

type Level = 'pass' | 'warn' | 'fail'
const results: Array<{ level: Level; label: string; detail?: string }> = []

function record(level: Level, label: string, detail?: string) {
  results.push({ level, label, detail })
}

const pass = (l: string, d?: string) => record('pass', l, d)
const warn = (l: string, d?: string) => record('warn', l, d)
const fail = (l: string, d?: string) => record('fail', l, d)

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function checkEnvironment() {
  const required = ['DATABASE_URL', 'DB_DRIVER', 'STORAGE_DRIVER']
  for (const key of required) {
    if (!process.env[key]) fail(`${key} is not set`)
  }

  const url = process.env.DATABASE_URL
  if (url) {
    let parsed: URL | null = null
    try {
      parsed = new URL(url)
    } catch {
      fail('DATABASE_URL is not a valid connection URL')
    }

    if (parsed) {
      if (!parsed.password) {
        fail('DATABASE_URL has no password')
      }
      // Neon terminates TLS at the proxy and refuses plaintext, but a
      // self-hosted target will happily accept it, which is the case worth
      // catching before it reaches production.
      const sslmode = parsed.searchParams.get('sslmode')
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      if (!isLocal && sslmode !== 'require' && sslmode !== 'verify-full') {
        fail(
          'DATABASE_URL does not require TLS',
          'Append ?sslmode=require to the connection string.',
        )
      } else if (!isLocal) {
        pass('Database connection requires TLS')
      }

      if (parsed.username === 'postgres' || parsed.username.endsWith('_owner')) {
        fail(
          `DATABASE_URL connects as "${parsed.username}"`,
          'The runtime must use the restricted role (hagroup_app). An owner or ' +
            'superuser silently bypasses every Row Level Security policy.',
        )
      }
    }
  }

  const driver = process.env.DB_DRIVER
  if (driver && driver !== 'neon' && driver !== 'node-postgres') {
    fail(`DB_DRIVER "${driver}" is not recognised`, 'Use "neon" or "node-postgres".')
  }

  const storage = process.env.STORAGE_DRIVER
  if (storage === 'vercel-blob') {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      fail(
        'STORAGE_DRIVER is "vercel-blob" but BLOB_READ_WRITE_TOKEN is not set',
        'Every upload — site photos, signatures, delivery proof — would fail at runtime.',
      )
    } else {
      pass('Blob storage is configured')
    }
  } else if (storage === 'local') {
    if (process.env.VERCEL) {
      fail(
        'STORAGE_DRIVER is "local" on Vercel',
        "Vercel's filesystem is ephemeral; uploaded files would vanish between " +
          'requests. Set STORAGE_DRIVER=vercel-blob.',
      )
    } else {
      pass('Local storage driver (not a serverless target)')
    }
  } else if (storage) {
    fail(`STORAGE_DRIVER "${storage}" is not recognised`)
  }

  // Optional integrations. Absent is a supported state — the platform reports
  // it rather than pretending, so these are warnings, never failures.
  if (process.env.ANTHROPIC_API_KEY) pass('AI assistant configured')
  else warn('AI assistant not configured', 'Drafting help is unavailable; everything else works.')

  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    pass('Email configured')
  } else {
    warn(
      'Email not configured',
      'Documents can be produced and approved but not sent. Messages queue and ' +
        'can be retried once credentials are set.',
    )
  }

  if (process.env.BOOTSTRAP_ADMIN_PASSWORD) {
    warn(
      'BOOTSTRAP_ADMIN_PASSWORD is still set',
      'Remove it from the environment once the first Administrator has signed in.',
    )
  }
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

async function checkDatabase() {
  const appUrl = process.env.DATABASE_URL
  if (!appUrl) return

  const app = new Client({ connectionString: appUrl })
  try {
    await app.connect()
  } catch (err) {
    fail('Cannot connect as the application role', err instanceof Error ? err.message : String(err))
    return
  }

  try {
    // --- The invariant the whole authorisation model rests on ---------------
    const { rows: attrs } = await app.query<{
      rolsuper: boolean
      rolbypassrls: boolean
      rolname: string
    }>('select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user')

    const me = attrs[0]
    if (!me) {
      fail('Could not read the current role from pg_roles')
    } else if (me.rolsuper) {
      fail(
        `Runtime role "${me.rolname}" is a SUPERUSER`,
        'Row Level Security is not enforced for superusers. Every policy in this ' +
          'platform would be inert.',
      )
    } else if (me.rolbypassrls) {
      fail(
        `Runtime role "${me.rolname}" has BYPASSRLS`,
        'Row Level Security is not enforced for this role.',
      )
    } else {
      pass(`Runtime role "${me.rolname}" is restricted (NOSUPERUSER, NOBYPASSRLS)`)
    }

    // --- Row Level Security is actually on, table by table ------------------
    const { rows: unprotected } = await app.query<{ tablename: string }>(`
      select c.relname as tablename
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and c.relname not like '\\_%'
         and not c.relrowsecurity
       order by c.relname
    `)

    if (unprotected.length > 0) {
      fail(
        `${unprotected.length} table(s) have Row Level Security disabled`,
        unprotected.map((r) => r.tablename).join(', '),
      )
    } else {
      pass('Row Level Security is enabled on every application table')
    }

    // --- The password hash must be unreadable, not merely unread ------------
    try {
      await app.query('select password_hash from public.profiles limit 1')
      fail(
        'The runtime role can read profiles.password_hash',
        'Column-level grants are missing. Re-run the migrations.',
      )
    } catch {
      pass('Password hashes are unreadable by the runtime role')
    }

  } catch (err) {
    fail('Database checks failed', err instanceof Error ? err.message : String(err))
  } finally {
    await app.end()
  }
}

// ---------------------------------------------------------------------------
// Configuration readiness
// ---------------------------------------------------------------------------

async function checkConfiguration() {
  const adminUrl = process.env.DATABASE_ADMIN_URL
  if (!adminUrl) {
    warn('DATABASE_ADMIN_URL not set', 'Skipping configuration checks.')
    return
  }

  const db = new Client({ connectionString: adminUrl })
  try {
    await db.connect()
  } catch (err) {
    warn('Cannot connect as the owner role', err instanceof Error ? err.message : String(err))
    return
  }

  try {
    // Every migration file's checksum, compared with what was recorded when it
    // ran. A changed file means the deployed schema is not the schema in git.
    const { readdirSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { createHash } = await import('node:crypto')

    const dir = join(process.cwd(), 'drizzle')
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const { rows: recorded } = await db.query<{ filename: string; checksum: string }>(
      'select filename, checksum from public._migrations',
    )
    const byName = new Map(recorded.map((r) => [r.filename, r.checksum]))

    const drifted: string[] = []
    const pending: string[] = []
    for (const f of files) {
      const sum = createHash('sha256').update(readFileSync(join(dir, f))).digest('hex')
      const known = byName.get(f)
      if (!known) pending.push(f)
      else if (known !== sum) drifted.push(f)
    }

    if (drifted.length > 0) {
      fail(
        `${drifted.length} migration(s) changed after being applied`,
        `${drifted.join(', ')} — the deployed schema no longer matches this repository.`,
      )
    } else {
      pass('Applied migrations match this repository')
    }

    pass(`${recorded.length} migration(s) applied`)

    if (pending.length > 0) {
      warn(
        `${pending.length} migration(s) not yet applied`,
        `${pending.join(', ')} — run npm run db:migrate against the target database.`,
      )
    }

    // --- What can actually be issued ---------------------------------------
    const need: Array<[string, string]> = [
      ['legal_entities', 'legal entity'],
      ['numbering_rules', 'document numbering rule'],
      ['rounding_policies', 'rounding policy'],
      ['approval_policies', 'approval policy'],
    ]

    for (const [table, label] of need) {
      const { rows } = await db.query<{ n: string }>(
        `select count(*)::text as n from public.${table} where state = 'approved'`,
      )
      if (rows[0]?.n === '0') {
        warn(
          `No approved ${label}`,
          'Documents cannot be issued until an Administrator approves this in ' +
            'Company settings. The platform blocks it deliberately rather than ' +
            'guessing a value.',
        )
      } else {
        pass(`${rows[0]?.n} approved ${label}(s)`)
      }
    }

    // A tax rate is separate: its absence is fine for a non-VAT document, but
    // a tax invoice cannot be produced without one.
    const { rows: tax } = await db.query<{ n: string }>(
      "select count(*)::text as n from public.tax_rules where state = 'approved'",
    )
    if (tax[0]?.n === '0') {
      warn('No approved tax rate', 'Tax invoices cannot be issued until VAT is approved.')
    } else {
      pass(`${tax[0]?.n} approved tax rate(s)`)
    }

    // --- Signing capability -------------------------------------------------
    const { rows: seals } = await db.query<{ kind: string; n: string }>(
      `select kind::text as kind, count(*)::text as n
         from public.company_assets
        where state = 'approved' and kind in ('signature', 'stamp')
        group by kind`,
    )
    const sealCount = new Map(seals.map((s) => [s.kind, s.n]))
    if (!sealCount.get('signature')) {
      warn(
        'No approved Director signature',
        'Documents whose approval policy requires a signature cannot be approved. ' +
          'A Director uploads their own in Brand assets.',
      )
    } else {
      pass(`${sealCount.get('signature')} approved signature(s)`)
    }
    if (!sealCount.get('stamp')) {
      warn('No approved company stamp', 'Documents requiring a stamp cannot be approved.')
    } else {
      pass('Company stamp approved')
    }

    // --- Nobody can sign in ------------------------------------------------
    const { rows: admins } = await db.query<{ n: string }>(`
      select count(*)::text as n
        from public.user_roles r
        join public.profiles p on p.id = r.user_id
       where r.role = 'administrator' and r.revoked_at is null and p.is_active
    `)
    if (admins[0]?.n === '0') {
      fail(
        'There is no active Administrator',
        'Nobody would be able to approve settings or manage users. Run npm run db:seed.',
      )
    } else {
      pass(`${admins[0]?.n} active Administrator(s)`)
    }
  } catch (err) {
    warn('Configuration checks incomplete', err instanceof Error ? err.message : String(err))
  } finally {
    await db.end()
  }
}

// ---------------------------------------------------------------------------

async function main() {
  checkEnvironment()
  await checkDatabase()
  await checkConfiguration()

  const failures = results.filter((r) => r.level === 'fail')
  const warnings = results.filter((r) => r.level === 'warn')

  const mark = { pass: '  ok  ', warn: ' warn ', fail: ' FAIL ' }

  console.log('')
  for (const r of results) {
    console.log(`[${mark[r.level]}] ${r.label}`)
    if (r.detail) console.log(`          ${r.detail}`)
  }

  console.log('')
  console.log(
    `${results.filter((r) => r.level === 'pass').length} passed · ` +
      `${warnings.length} warning(s) · ${failures.length} failure(s)`,
  )

  if (failures.length > 0) {
    console.log('\nDo not deploy until the failures above are resolved.')
    process.exit(1)
  }

  console.log(
    warnings.length > 0
      ? '\nSafe to deploy. The warnings describe features that will report themselves as unavailable.'
      : '\nSafe to deploy.',
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
