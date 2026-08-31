import { existsSync } from 'node:fs'
import { config } from 'dotenv'

/**
 * Where the tests get their database.
 *
 * The suite is not a mock: it opens real transactions as the real restricted
 * role and attacks the real policies. That is the point — and it is also why it
 * writes, deletes, and deliberately violates constraints.
 *
 * So it must never touch a deployed database. `.env.test.local` is preferred
 * when it exists, and the host is checked regardless: pointing the suite at a
 * remote database is refused rather than merely discouraged, because the cost
 * of finding out afterwards is unrecoverable.
 *
 * The escape hatch exists for a genuinely disposable remote branch — a Neon
 * preview branch, say — and has to be set deliberately.
 */
config({ path: existsSync('.env.test.local') ? '.env.test.local' : '.env.local', quiet: true })

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.test.local.')
}

if (process.env.ALLOW_REMOTE_TEST_DB !== '1') {
  const host = new URL(url).hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'

  if (!isLocal) {
    throw new Error(
      `The test suite is pointed at "${host}", which is not a local database.\n\n` +
        'These tests write, delete and deliberately violate constraints. Running\n' +
        'them against a deployed database would corrupt it.\n\n' +
        'Put a local connection in .env.test.local, or — only if that database is\n' +
        'genuinely disposable — re-run with ALLOW_REMOTE_TEST_DB=1.',
    )
  }
}
