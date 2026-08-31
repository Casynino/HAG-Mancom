import Link from 'next/link'
import type { Metadata } from 'next'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { notifications } from '@/db/schema'
import { markNotificationsReadAction } from '@/server/notification-actions'
import { Badge, EmptyState, PageHeader, Panel } from '@/components/ui'
import { SubmitButton } from '@/components/form'
import { pageContext } from '@/lib/authz/guard'
import { relativeTime } from '@/lib/display'

export const metadata: Metadata = { title: 'Notifications' }

export default async function NotificationsPage() {
  const { rows, unread } = await pageContext(async (db, actor) => {
    const result = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, actor.id))
      .orderBy(desc(notifications.createdAt))
      .limit(100)

    const unreadRows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)))

    return { rows: result, unread: unreadRows.length }
  })

  return (
    <>
      <PageHeader
        eyebrow="Notifications"
        title={unread > 0 ? `${unread} unread` : 'Notifications'}
        description="What has happened on your work."
        stats={[
          { label: 'unread', value: unread },
          { label: 'in total', value: rows.length },
        ]}
        action={
          unread > 0 ? (
            <form action={markNotificationsReadAction}>
              <SubmitButton variant="secondary" size="sm" pendingLabel="Marking…">
                Mark all as read
              </SubmitButton>
            </form>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nothing yet"
            description="You will be told here when a submission needs you, or when one of yours moves on."
          />
        </Panel>
      ) : (
        <Panel className="divide-y divide-ink-100">
          {rows.map((n) => {
            const body = (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p
                    className={
                      n.readAt ? 'text-sm text-ink-700' : 'text-sm font-medium text-ink-900'
                    }
                  >
                    {n.title}
                  </p>
                  <span className="text-xs text-ink-400">{relativeTime(n.createdAt)}</span>
                </div>
                {n.body ? <p className="mt-0.5 text-sm text-ink-500">{n.body}</p> : null}
                {!n.readAt ? (
                  <Badge tone="brand" className="mt-1.5">
                    New
                  </Badge>
                ) : null}
              </>
            )

            return n.href ? (
              <Link key={n.id} href={n.href} className="block px-4 py-3.5 hover:bg-ink-50 sm:px-5">
                {body}
              </Link>
            ) : (
              <div key={n.id} className="px-4 py-3.5 sm:px-5">
                {body}
              </div>
            )
          })}
        </Panel>
      )}
    </>
  )
}
