'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { profiles } from '@/db/schema'
import { recordAudit } from '@/lib/audit'
import { asActor } from '@/lib/authz/guard'
import { actionError, ValidationError, type ActionResult } from '@/lib/errors'

/**
 * A person editing their own record.
 *
 * Three fields, deliberately: the name that prints beside their decisions, a
 * phone number so site can reach them, and a job title. Not the email — that is
 * the identity every audit row, session and document decision is attributed to,
 * and letting somebody rewrite it silently rewrites who did what. Not the roles,
 * which are an Administrator's to grant. Not `is_active`, which is how an
 * account is closed.
 *
 * The database agrees rather than taking this on trust: the RLS policy on
 * profiles admits an update only where `id = app.current_user_id()` or the
 * actor is an Administrator, and the column grant does not include `email` or
 * `password_hash` at all. This action narrows further; it does not create the
 * boundary.
 */
export async function updateOwnProfileAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const fullName = String(formData.get('fullName') ?? '').trim()
    const phone = String(formData.get('phone') ?? '').trim()
    const jobTitle = String(formData.get('jobTitle') ?? '').trim()

    const fieldErrors: Record<string, string[]> = {}
    if (fullName.length < 2) {
      fieldErrors.fullName = ['Give the name colleagues will recognise.']
    }
    if (fullName.length > 120) {
      fieldErrors.fullName = ['That is too long for a document signature line.']
    }
    if (phone && !/^[+\d][\d\s()-]{6,24}$/.test(phone)) {
      fieldErrors.phone = ['Use digits, spaces and an optional leading +.']
    }
    if (jobTitle.length > 120) {
      fieldErrors.jobTitle = ['Keep the title under 120 characters.']
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Check the details below.', fieldErrors)
    }

    await asActor(async (db, actor) => {
      await db
        .update(profiles)
        .set({
          fullName,
          phone: phone || null,
          jobTitle: jobTitle || null,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, actor.id))

      // Recorded like any other change. A person editing their own name is
      // unremarkable; a name changing the day before a disputed approval is not,
      // and the trail is the only thing that can tell those apart later.
      await recordAudit(db, actor, {
        action: 'user.updated',
        entityType: 'profiles',
        entityId: actor.id,
        metadata: { self: true, fullName, phone: phone || null, jobTitle: jobTitle || null },
      })
    })

    revalidatePath('/profile')
    revalidatePath('/', 'layout')
    return { ok: true, data: null, message: 'Your details are updated.' }
  } catch (err) {
    return actionError(err)
  }
}
