import 'server-only'

import { drizzle as drizzleNodePg, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { Pool as NodePgPool } from 'pg'
import * as schema from './schema'

/**
 * Database access for the HA GROUP platform.
 *
 * The application connects as a RESTRICTED Postgres role. Every statement it
 * issues is subject to Row Level Security, so authorisation is enforced by the
 * database rather than trusted to the calling code. To make that work, each
 * request runs inside a transaction that declares who is acting:
 *
 *     BEGIN;
 *     SET LOCAL app.user_id = '<uuid>';
 *     ... queries ...
 *     COMMIT;
 *
 * `SET LOCAL` is scoped to the transaction, so a pooled connection can never
 * leak one user's identity into another user's request.
 *
 * Operations that must run before an identity exists — looking up a login
 * candidate, resolving a session cookie — do not use this path. They call
 * SECURITY DEFINER functions in the `app` schema which expose exactly the
 * columns they need and nothing else.
 */

export type Database = NodePgDatabase<typeof schema>

type PoolLike = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>
  end: () => Promise<void>
}

interface GlobalWithPool {
  __hagroupPool?: PoolLike
  __hagroupDb?: Database
}

const globalRef = globalThis as unknown as GlobalWithPool

function connectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and configure the ' +
        'restricted application role. See scripts/bootstrap.ts.',
    )
  }
  return url
}

function createPool(): PoolLike {
  const driver = process.env.DB_DRIVER ?? 'node-postgres'

  if (driver === 'neon') {
    // Neon's serverless driver over WebSockets. Chosen over the HTTP driver
    // because Row Level Security here depends on `SET LOCAL` inside a real
    // transaction, which the HTTP driver cannot provide.
    //
    // Required at runtime only, so a local install never has to resolve it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool, neonConfig } = require('@neondatabase/serverless')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require('ws')
    neonConfig.webSocketConstructor = ws
    return new Pool({ connectionString: connectionString() }) as PoolLike
  }

  return new NodePgPool({
    connectionString: connectionString(),
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  }) as unknown as PoolLike
}

function getPool(): PoolLike {
  if (!globalRef.__hagroupPool) {
    globalRef.__hagroupPool = createPool()
  }
  return globalRef.__hagroupPool
}

/**
 * Raw handle. Prefer `withUser` — a query issued here carries no identity, so
 * RLS will correctly hide almost everything.
 */
export function getDb(): Database {
  if (!globalRef.__hagroupDb) {
    const driver = process.env.DB_DRIVER ?? 'node-postgres'
    if (driver === 'neon') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { drizzle: drizzleNeon } = require('drizzle-orm/neon-serverless')
      globalRef.__hagroupDb = drizzleNeon(getPool(), { schema }) as Database
    } else {
      globalRef.__hagroupDb = drizzleNodePg(getPool() as unknown as NodePgPool, { schema })
    }
  }
  return globalRef.__hagroupDb
}

/**
 * Run work as a specific user, inside one transaction, with RLS applied.
 *
 * The identity is set with `set_config(..., true)` — the `true` makes it
 * transaction-local, which is what keeps pooled connections safe.
 */
export async function withUser<T>(userId: string, fn: (tx: Database) => Promise<T>): Promise<T> {
  const db = getDb()
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`)
    return fn(tx as unknown as Database)
  })
}

/*
 * A note for whoever profiles a slow page next.
 *
 * Everything above runs in ONE transaction, and that is not incidental: the
 * third argument to set_config makes the setting transaction-local, which is
 * what keeps one request's identity from leaking into another's on a pooled
 * connection. It is the whole reason RLS can be trusted here.
 *
 * The consequence is that a `Promise.all` inside a callback does not run in
 * parallel. A transaction is one connection, so those queries queue. The
 * dashboard issues about ten and they go one after another.
 *
 * This is cheap where it matters and expensive where it does not. Vercel runs
 * in iad1 and Neon in us-east-2, roughly 12ms apart, so ten serial queries cost
 * a tenth of a second in production. From a laptop in Tanzania the same round
 * trip measured 310ms — a bare `select 1` costs the same as any real query —
 * so the same page takes five to nine seconds in development and looks broken.
 *
 * Do not restructure this into parallel connections to fix a number you
 * measured locally. Each would need its own set_config, and you would be
 * trading the guarantee that makes RLS safe for latency the deployment does not
 * actually have. Measure against production first.
 */

/**
 * Run work with no user identity. RLS still applies and will hide anything that
 * requires one. Used only for the pre-authentication path and for scripts.
 */
export async function withoutUser<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
  const db = getDb()
  return db.transaction(async (tx) => fn(tx as unknown as Database))
}

export { schema }
