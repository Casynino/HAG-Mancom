'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { notifications } from '@/db/schema'
import { asActor } from '@/lib/authz/guard'

/**
 * Marks the caller's unread notifications as read.
 *
 * Scoped to the acting user by the query and, independently, by the RLS UPDATE
 * policy on notifications — so this cannot clear anyone else's.
 */
export async function markNotificationsReadAction(): Promise<void> {
  await asActor(async (db, actor) => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)))
  })

  revalidatePath('/notifications')
}
