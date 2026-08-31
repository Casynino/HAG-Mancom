import 'server-only'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { sql } from 'drizzle-orm'
import { withoutUser } from '@/db/client'
import { isAppRole, type AppRole } from '@/lib/authz/roles'

export const SESSION_COOKIE = 'hag_session'
const SESSION_TTL_HOURS = 12
const TOKEN_BYTES = 32

export interface AuthenticatedUser {
  id: string
  email: string
  fullName: string
  mustChangePassword: boolean
  roles: AppRole[]
  sessionId: string
}

/** Only the digest is ever stored, so the sessions table cannot be replayed. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

async function requestMetadata() {
  const h = await headers()
  // Vercel and most proxies set x-forwarded-for; the left-most entry is the client.
  const forwarded = h.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent')?.slice(0, 500) ?? null
  return { ip, userAgent }
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000)
  const { ip, userAgent } = await requestMetadata()

  await withoutUser(async (tx) => {
    await tx.execute(
      sql`select app.create_session(${userId}::uuid, ${tokenHash}, ${expiresAt.toISOString()}::timestamptz, ${ip}, ${userAgent})`,
    )
  })

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

/**
 * Resolves the session cookie to a user, or null.
 *
 * This is the single place the platform decides who is acting. Everything
 * downstream — permission checks, the RLS identity, audit attribution — derives
 * from what this returns.
 */
export async function resolveSession(): Promise<AuthenticatedUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  const tokenHash = hashToken(token)

  const rows = await withoutUser(async (tx) => {
    const result = await tx.execute(sql`select * from app.resolve_session(${tokenHash})`)
    return result.rows as Array<{
      session_id: string
      user_id: string
      email: string
      full_name: string
      must_change_password: boolean
      roles: string[] | null
    }>
  })

  const row = rows[0]
  if (!row) return null

  // Defensive: only values the application actually knows become roles. A row
  // holding something unrecognised grants nothing rather than reaching the
  // permission matrix as an unknown key.
  const roles = (Array.isArray(row.roles) ? row.roles : []).filter(isAppRole)

  return {
    id: row.user_id,
    email: row.email,
    fullName: row.full_name,
    mustChangePassword: row.must_change_password,
    roles,
    sessionId: row.session_id,
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value

  if (token) {
    const tokenHash = hashToken(token)
    await withoutUser(async (tx) => {
      await tx.execute(sql`select app.revoke_session(${tokenHash})`)
    })
  }

  store.delete(SESSION_COOKIE)
}

/** Ends every other session for a user. Used after a password change. */
export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  return withoutUser(async (tx) => {
    const result = await tx.execute(
      sql`select app.revoke_user_sessions(${userId}::uuid, ${keepSessionId}::uuid) as count`,
    )
    return Number((result.rows[0] as { count: number } | undefined)?.count ?? 0)
  })
}

/**
 * Compares two secrets without leaking length or content through timing.
 * Used for the CSRF double-submit check on destructive form posts.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export { hashToken }
