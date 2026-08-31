'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { withUser, withoutUser } from '@/db/client'
import { recordAudit } from '@/lib/audit'
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/auth/password'
import { createSession, destroySession, revokeOtherSessions } from '@/lib/auth/session'
import { getActor, requireActorOrThrow } from '@/lib/authz/guard'
import { defaultRouteFor, type AppRole } from '@/lib/authz/roles'
import { actionError, ValidationError, type ActionResult } from '@/lib/errors'
import { changePasswordSchema, fieldErrorsFrom, signInSchema } from '@/lib/validation/schemas'

/**
 * Authentication actions.
 *
 * Sign-in deliberately gives the same answer for "no such account", "wrong
 * password" and "account disabled". Telling them apart would let anyone
 * enumerate who works here and which accounts are live.
 */

const MAX_FAILURES_PER_ACCOUNT = 8
const MAX_FAILURES_PER_IP = 25
const FAILURE_WINDOW_MINUTES = 15

const GENERIC_FAILURE = 'That email address and password do not match an active account.'

async function clientIp(): Promise<string | null> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
}

interface LoginCandidate {
  id: string
  email: string
  full_name: string
  password_hash: string
  is_active: boolean
  must_change_password: boolean
  failed_login_attempts: number
  locked_until: string | null
}

export async function signInAction(
  _prev: ActionResult<{ redirectTo: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  let destination: string

  try {
    const parsed = signInSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    })

    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }

    const { email, password } = parsed.data
    const ip = await clientIp()

    // Rate limit before doing any password work, so a flood costs us nothing.
    const limits = await withoutUser(async (tx) => {
      const r = await tx.execute(
        sql`select * from app.recent_failure_count(${email}, ${ip}, ${FAILURE_WINDOW_MINUTES})`,
      )
      return r.rows[0] as { email_failures: string; ip_failures: string } | undefined
    })

    const emailFailures = Number(limits?.email_failures ?? 0)
    const ipFailures = Number(limits?.ip_failures ?? 0)

    if (emailFailures >= MAX_FAILURES_PER_ACCOUNT || ipFailures >= MAX_FAILURES_PER_IP) {
      await withoutUser((tx) =>
        tx.execute(sql`select app.log_login_attempt(${email}, ${ip}, false, 'rate_limited')`),
      )
      return {
        ok: false,
        error: 'Too many sign-in attempts. Wait 15 minutes and try again.',
        code: 'rate_limited',
      }
    }

    const candidate = await withoutUser(async (tx) => {
      const r = await tx.execute(sql`select * from app.find_login_candidate(${email})`)
      return r.rows[0] as LoginCandidate | undefined
    })

    const fail = async (reason: string) => {
      await withoutUser(async (tx) => {
        await tx.execute(sql`select app.log_login_attempt(${email}, ${ip}, false, ${reason})`)
        if (candidate) {
          await tx.execute(
            sql`select app.register_login_failure(${email}, ${MAX_FAILURES_PER_ACCOUNT})`,
          )
        }
      })
    }

    if (!candidate) {
      // Still do the hashing work, so a missing account is not measurably
      // faster than a wrong password.
      await verifyPassword(password, 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAA')
      await fail('no_such_account')
      return { ok: false, error: GENERIC_FAILURE, code: 'invalid_credentials' }
    }

    if (candidate.locked_until && new Date(candidate.locked_until) > new Date()) {
      await fail('locked')
      return {
        ok: false,
        error:
          'This account is temporarily locked after repeated failed attempts. Try again shortly.',
        code: 'locked',
      }
    }

    const valid = await verifyPassword(password, candidate.password_hash)

    if (!valid) {
      await fail('bad_password')
      return { ok: false, error: GENERIC_FAILURE, code: 'invalid_credentials' }
    }

    if (!candidate.is_active) {
      await fail('inactive')
      return { ok: false, error: GENERIC_FAILURE, code: 'invalid_credentials' }
    }

    await withoutUser(async (tx) => {
      await tx.execute(sql`select app.register_login_success(${candidate.id}::uuid)`)
      await tx.execute(sql`select app.log_login_attempt(${email}, ${ip}, true, null)`)
    })

    await createSession(candidate.id)

    const roles = await withUser(candidate.id, async (tx) => {
      const r = await tx.execute(
        sql`select role from public.user_roles where user_id = ${candidate.id}::uuid and revoked_at is null`,
      )
      return (r.rows as Array<{ role: AppRole }>).map((x) => x.role)
    })

    await withUser(candidate.id, (tx) =>
      recordAudit(
        tx,
        { id: candidate.id, email: candidate.email, primaryRole: roles[0] ?? null },
        { action: 'auth.sign_in', entityType: 'profiles', entityId: candidate.id },
      ),
    )

    destination = candidate.must_change_password ? '/change-password' : defaultRouteFor(roles)
  } catch (err) {
    return actionError(err)
  }

  // Outside the try: redirect() signals by throwing and must not be caught.
  redirect(destination)
}

export async function signOutAction(): Promise<void> {
  const actor = await getActor()

  if (actor) {
    await withUser(actor.id, (tx) =>
      recordAudit(tx, actor, {
        action: 'auth.sign_out',
        entityType: 'profiles',
        entityId: actor.id,
      }),
    )
  }

  await destroySession()
  redirect('/sign-in')
}

export async function changePasswordAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  let destination: string

  try {
    const actor = await requireActorOrThrow()

    const parsed = changePasswordSchema.safeParse({
      currentPassword: formData.get('currentPassword'),
      newPassword: formData.get('newPassword'),
      confirmPassword: formData.get('confirmPassword'),
    })

    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }

    const { currentPassword, newPassword } = parsed.data

    const strength = validatePasswordStrength(newPassword)
    if (strength.length > 0) {
      throw new ValidationError('Choose a stronger password.', { newPassword: strength })
    }

    const candidate = await withoutUser(async (tx) => {
      const r = await tx.execute(sql`select * from app.find_login_candidate(${actor.email})`)
      return r.rows[0] as LoginCandidate | undefined
    })

    if (!candidate || !(await verifyPassword(currentPassword, candidate.password_hash))) {
      throw new ValidationError('That is not your current password.', {
        currentPassword: ['That is not your current password.'],
      })
    }

    const newHash = await hashPassword(newPassword)

    await withUser(actor.id, async (tx) => {
      await tx.execute(sql`select app.set_password(${actor.id}::uuid, ${newHash}, false)`)
      await recordAudit(tx, actor, {
        action: 'auth.password_changed',
        entityType: 'profiles',
        entityId: actor.id,
      })
    })

    // A password change ends every other session for this account.
    await revokeOtherSessions(actor.id, actor.sessionId)

    destination = defaultRouteFor(actor.roles)
  } catch (err) {
    return actionError(err)
  }

  redirect(destination)
}
