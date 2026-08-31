'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { profiles, userRoles } from '@/db/schema'
import { recordAudit } from '@/lib/audit'
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password'
import { revokeOtherSessions } from '@/lib/auth/session'
import { asActorWith } from '@/lib/authz/guard'
import type { AppRole } from '@/lib/authz/roles'
import {
  actionError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ActionResult,
} from '@/lib/errors'
import {
  createUserSchema,
  fieldErrorsFrom,
  setUserActiveSchema,
  updateUserRolesSchema,
} from '@/lib/validation/schemas'

/**
 * User and role administration.
 *
 * Roles are the whole permission system, so every grant and revoke is audited
 * with the actor who made it. Grants are revoked by stamping `revoked_at`, not
 * by deleting the row — "who used to be a Director" stays answerable.
 */

export async function createUserAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createUserSchema.safeParse({
      email: formData.get('email'),
      fullName: formData.get('fullName'),
      phone: formData.get('phone') ?? undefined,
      jobTitle: formData.get('jobTitle') ?? undefined,
      roles: formData.getAll('roles'),
      temporaryPassword: formData.get('temporaryPassword'),
    })
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const v = parsed.data

    const strength = validatePasswordStrength(v.temporaryPassword)
    if (strength.length > 0) {
      throw new ValidationError('Choose a stronger temporary password.', {
        temporaryPassword: strength,
      })
    }

    const id = await asActorWith('user.manage', async (db, actor) => {
      const hash = await hashPassword(v.temporaryPassword)

      // must_change_password defaults to true: the temporary password the
      // Administrator sets is never the one the person keeps.
      const [created] = await db
        .insert(profiles)
        .values({
          email: v.email,
          fullName: v.fullName,
          phone: v.phone ?? null,
          jobTitle: v.jobTitle ?? null,
          passwordHash: hash,
          mustChangePassword: true,
          isActive: true,
          createdBy: actor.id,
        })
        .returning({ id: profiles.id })

      const userId = created!.id

      await db.insert(userRoles).values(
        v.roles.map((role) => ({
          userId,
          role: role as AppRole,
          grantedBy: actor.id,
        })),
      )

      await recordAudit(db, actor, {
        action: 'user.created',
        entityType: 'profiles',
        entityId: userId,
        metadata: { email: v.email, roles: v.roles },
      })

      for (const role of v.roles) {
        await recordAudit(db, actor, {
          action: 'user.role_granted',
          entityType: 'profiles',
          entityId: userId,
          metadata: { role },
        })
      }

      return userId
    })

    revalidatePath('/admin/users')
    return {
      ok: true,
      data: { id },
      message: `${v.fullName} added. They must change the temporary password when they first sign in.`,
    }
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return {
        ok: false,
        error: 'Someone already has that email address.',
        code: 'duplicate',
        fieldErrors: { email: ['That email address is already in use.'] },
      }
    }
    return actionError(err)
  }
}

/**
 * Sets a user's roles to exactly the list given: grants what is missing,
 * revokes what is no longer wanted.
 */
export async function updateUserRolesAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const parsed = updateUserRolesSchema.safeParse({
      userId: formData.get('userId'),
      roles: formData.getAll('roles'),
    })
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const { userId, roles } = parsed.data

    await asActorWith('user.manage', async (db, actor) => {
      const [target] = await db
        .select({ id: profiles.id, fullName: profiles.fullName })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1)

      if (!target) throw new NotFoundError('That person no longer has an account.')

      const current = await db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt)))

      const currentSet = new Set(current.map((r) => r.role))
      const wanted = new Set(roles)

      // An Administrator must not remove their own last administrator grant —
      // it is the one change that can lock the whole system out of configuration.
      if (userId === actor.id && currentSet.has('administrator') && !wanted.has('administrator')) {
        const [adminCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(userRoles)
          .where(and(eq(userRoles.role, 'administrator'), isNull(userRoles.revokedAt)))

        if ((adminCount?.count ?? 0) <= 1) {
          throw new ConflictError(
            'You are the only Administrator. Give someone else the Administrator role before removing your own.',
          )
        }
      }

      const toGrant = [...wanted].filter((r) => !currentSet.has(r))
      const toRevoke = [...currentSet].filter((r) => !wanted.has(r))

      if (toGrant.length > 0) {
        await db
          .insert(userRoles)
          .values(toGrant.map((role) => ({ userId, role, grantedBy: actor.id })))
      }

      for (const role of toRevoke) {
        await db
          .update(userRoles)
          .set({ revokedAt: new Date(), revokedBy: actor.id })
          .where(
            and(
              eq(userRoles.userId, userId),
              eq(userRoles.role, role),
              isNull(userRoles.revokedAt),
            ),
          )
      }

      for (const role of toGrant) {
        await recordAudit(db, actor, {
          action: 'user.role_granted',
          entityType: 'profiles',
          entityId: userId,
          metadata: { role },
        })
      }
      for (const role of toRevoke) {
        await recordAudit(db, actor, {
          action: 'user.role_revoked',
          entityType: 'profiles',
          entityId: userId,
          metadata: { role },
        })
      }
    })

    revalidatePath('/admin/users')
    return { ok: true, data: null, message: 'Roles updated.' }
  } catch (err) {
    return actionError(err)
  }
}

export async function setUserActiveAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const parsed = setUserActiveSchema.safeParse({
      userId: formData.get('userId'),
      isActive: formData.get('isActive') === 'true',
    })
    if (!parsed.success) {
      throw new ValidationError('Check the details below.', fieldErrorsFrom(parsed.error))
    }
    const { userId, isActive } = parsed.data

    await asActorWith('user.manage', async (db, actor) => {
      if (userId === actor.id && !isActive) {
        throw new ConflictError('You cannot deactivate your own account.')
      }

      const updated = await db
        .update(profiles)
        .set({ isActive })
        .where(eq(profiles.id, userId))
        .returning({ id: profiles.id, fullName: profiles.fullName })

      if (updated.length === 0) throw new NotFoundError('That person no longer has an account.')

      await recordAudit(db, actor, {
        action: isActive ? 'user.updated' : 'user.deactivated',
        entityType: 'profiles',
        entityId: userId,
        metadata: { isActive },
      })
    })

    // Deactivating ends their sessions immediately rather than at expiry.
    if (!isActive) await revokeOtherSessions(userId, '00000000-0000-0000-0000-000000000000')

    revalidatePath('/admin/users')
    return {
      ok: true,
      data: null,
      message: isActive ? 'Account reactivated.' : 'Account deactivated and signed out.',
    }
  } catch (err) {
    return actionError(err)
  }
}

/** Issues a new temporary password. The user must change it at next sign-in. */
export async function resetUserPasswordAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const userId = String(formData.get('userId') ?? '')
    const temporaryPassword = String(formData.get('temporaryPassword') ?? '')

    const strength = validatePasswordStrength(temporaryPassword)
    if (strength.length > 0) {
      throw new ValidationError('Choose a stronger temporary password.', {
        temporaryPassword: strength,
      })
    }

    await asActorWith('user.manage', async (db, actor) => {
      const hash = await hashPassword(temporaryPassword)
      await db.execute(sql`select app.set_password(${userId}::uuid, ${hash}, true)`)

      await recordAudit(db, actor, {
        action: 'auth.password_changed',
        entityType: 'profiles',
        entityId: userId,
        metadata: { byAdministrator: true, forcedChange: true },
      })
    })

    await revokeOtherSessions(userId, '00000000-0000-0000-0000-000000000000')

    revalidatePath('/admin/users')
    return {
      ok: true,
      data: null,
      message: 'Temporary password set. All their sessions have been ended.',
    }
  } catch (err) {
    return actionError(err)
  }
}
