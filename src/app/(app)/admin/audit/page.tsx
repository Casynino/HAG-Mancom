import type { Metadata } from 'next'
import { desc, eq } from 'drizzle-orm'
import { auditLog, profiles } from '@/db/schema'
import { Badge, EmptyState, PageHeader, Panel, SectionBar } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission, ROLE_LABELS, type AppRole } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { formatDateTime } from '@/lib/display'

export const metadata: Metadata = { title: 'Audit trail' }

const PAGE_SIZE = 100

/** Actions that change who can do what, or that touch money and approvals. */
const SIGNIFICANT = new Set([
  'user.role_granted',
  'user.role_revoked',
  'user.created',
  'user.deactivated',
  'config.approved',
  'config.rejected',
  'auth.password_changed',
])

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam ?? '1') || 1)

  const rows = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'audit.view')) {
      throw new AuthorizationError('The audit trail is visible to Directors and Administrators.')
    }

    return db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        metadata: auditLog.metadata,
        actorRole: auditLog.actorRole,
        actorEmail: auditLog.actorEmail,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
        actorName: profiles.fullName,
      })
      .from(auditLog)
      .leftJoin(profiles, eq(profiles.id, auditLog.actorId))
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE)
  })

  return (
    <>
      <PageHeader
        eyebrow="Oversight"
        title="Audit trail"
        description="Append-only. Records cannot be edited or deleted by anyone, including administrators and the database owner."
        stats={[
          { label: 'on this page', value: rows.length },
          { label: 'page', value: page },
        ]}
      />

      <SectionBar
        label="Everything that happened"
        scope="Newest first · enforced by a database trigger, not by convention"
        tone="brand"
      />

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title={page > 1 ? 'Nothing further back' : 'No activity recorded yet'}
            description={
              page > 1
                ? 'You have reached the end of the trail.'
                : 'Every sign-in, submission, approval and settings change will appear here.'
            }
          />
        </Panel>
      ) : (
        <Panel className="divide-y divide-ink-100">
          {rows.map((r) => (
            <div key={r.id} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-ink-900">{r.action}</span>
                  {SIGNIFICANT.has(r.action) ? <Badge tone="warn">Privileged</Badge> : null}
                </div>
                <span className="text-xs text-ink-400">{formatDateTime(r.createdAt)}</span>
              </div>

              <p className="mt-0.5 text-sm text-ink-600">
                {r.actorName ?? r.actorEmail ?? 'System'}
                {r.actorRole ? ` · ${ROLE_LABELS[r.actorRole as AppRole]}` : ''}
                {r.ipAddress ? ` · ${r.ipAddress}` : ''}
              </p>

              <p className="mt-0.5 text-xs text-ink-400">
                {r.entityType}
                {r.entityId ? ` · ${r.entityId}` : ''}
              </p>

              {r.metadata ? (
                <pre className="mt-1.5 overflow-x-auto rounded bg-ink-50 px-2.5 py-1.5 text-xs text-ink-600">
                  {JSON.stringify(r.metadata)}
                </pre>
              ) : null}
            </div>
          ))}
        </Panel>
      )}

      <div className="flex items-center justify-between">
        {page > 1 ? (
          <a
            href={`/admin/audit?page=${page - 1}`}
            className="tap inline-flex items-center rounded border border-ink-300 bg-panel px-4 text-sm text-ink-700 hover:bg-ink-50"
          >
            ← Newer
          </a>
        ) : (
          <span />
        )}
        {rows.length === PAGE_SIZE ? (
          <a
            href={`/admin/audit?page=${page + 1}`}
            className="tap inline-flex items-center rounded border border-ink-300 bg-panel px-4 text-sm text-ink-700 hover:bg-ink-50"
          >
            Older →
          </a>
        ) : null}
      </div>
    </>
  )
}
