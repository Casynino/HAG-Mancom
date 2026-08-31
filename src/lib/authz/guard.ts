import 'server-only'

import { forbidden, redirect } from 'next/navigation'
import { withUser, type Database } from '@/db/client'
import { AuthenticationError, AuthorizationError } from '@/lib/errors'
import { resolveSession, type AuthenticatedUser } from '@/lib/auth/session'
import { hasPermission, type AppRole, type Permission } from './roles'

/**
 * Server-side guards.
 *
 * The rule for this codebase: nothing that reads or writes business data runs
 * without passing through one of these. They resolve the session, check the
 * permission matrix, and hand back a database handle already scoped to the
 * acting user so Row Level Security applies to every statement.
 */

export interface Actor extends AuthenticatedUser {
  /** The role recorded against actions this actor takes. */
  primaryRole: AppRole | null
}

function primaryRoleOf(roles: readonly AppRole[]): AppRole | null {
  // Ordered by operational authority so audit records name the most
  // significant role the person was actually holding.
  for (const candidate of ['administrator', 'director', 'technical_officer', 'engineer'] as const) {
    if (roles.includes(candidate)) return candidate
  }
  return null
}

/** Current user, or null. Never throws — for optional-auth surfaces. */
export async function getActor(): Promise<Actor | null> {
  const session = await resolveSession()
  if (!session) return null
  return { ...session, primaryRole: primaryRoleOf(session.roles) }
}

/** Current user, or a redirect to sign-in. For pages. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor()
  if (!actor) redirect('/sign-in')

  // A first-time or reset account cannot reach anything until the password is
  // changed. The change-password page itself is excluded by its own layout.
  if (actor.mustChangePassword) redirect('/change-password')

  return actor
}

/** Current user, or throw. For Server Actions and route handlers. */
export async function requireActorOrThrow(): Promise<Actor> {
  const actor = await getActor()
  if (!actor) throw new AuthenticationError()
  return actor
}

export async function requirePermission(permission: Permission): Promise<Actor> {
  const actor = await requireActorOrThrow()
  if (!hasPermission(actor.roles, permission)) {
    throw new AuthorizationError()
  }
  return actor
}

export async function requireRole(...roles: AppRole[]): Promise<Actor> {
  const actor = await requireActorOrThrow()
  if (!actor.roles.some((r) => roles.includes(r))) {
    throw new AuthorizationError()
  }
  return actor
}

/**
 * Runs work as the current user with RLS applied.
 *
 * Prefer `asActor` over calling `withUser` directly — it guarantees the
 * identity used for the database context is the one the session actually
 * resolved to, and never something passed in by a caller.
 */
export async function asActor<T>(fn: (db: Database, actor: Actor) => Promise<T>): Promise<T> {
  const actor = await requireActorOrThrow()
  return withUser(actor.id, (db) => fn(db, actor))
}

/** As above, but checks a permission first. */
export async function asActorWith<T>(
  permission: Permission,
  fn: (db: Database, actor: Actor) => Promise<T>,
): Promise<T> {
  const actor = await requirePermission(permission)
  return withUser(actor.id, (db) => fn(db, actor))
}

/**
 * For pages: an actor plus a scoped database handle.
 *
 * An AuthorizationError from inside the callback becomes a redirect to a page
 * that says plainly what happened, rather than a thrown error the boundary
 * renders as "Something went wrong". Two reasons that matters:
 *
 *   * the person gets a sentence they can act on, not a shrug;
 *   * the response carries a real 403, so a smoke test or an uptime check can
 *     tell a refusal from a success. Streaming commits the status before the
 *     page component runs, so forbidden() is what makes that possible.
 *
 * The data was never at risk either way — the throw happens before rendering,
 * and Row Level Security independently hides the rows. This is about the
 * refusal being legible.
 */
export async function pageContext<T>(fn: (db: Database, actor: Actor) => Promise<T>): Promise<T> {
  const actor = await requireActor()

  try {
    return await withUser(actor.id, (db) => fn(db, actor))
  } catch (err) {
    if (err instanceof AuthorizationError) {
      // Renders forbidden.tsx with a 403.
      forbidden()
    }
    throw err
  }
}
