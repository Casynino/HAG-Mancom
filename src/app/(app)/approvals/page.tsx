import Link from 'next/link'
import type { Metadata } from 'next'
import { asc, eq, inArray } from 'drizzle-orm'
import { clients, documents, profiles, projects } from '@/db/schema'
import { Badge, EmptyState, PageHeader, Panel } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { formatAmount } from '@/lib/finance/decimal'
import { DOCUMENT_TYPE_LABELS, relativeTime } from '@/lib/display'

export const metadata: Metadata = { title: 'Approvals' }

/**
 * The Director's inbox.
 *
 * Built for a phone first: the list is a single column of large tap targets,
 * each carrying the four things needed to decide whether to open it — what it
 * is, who it is for, how much, and how long it has been waiting.
 */
export default async function ApprovalsPage() {
  const rows = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'approval.decide')) {
      throw new AuthorizationError('The approval inbox is for Directors.')
    }

    return db
      .select({
        id: documents.id,
        reference: documents.reference,
        documentType: documents.documentType,
        title: documents.title,
        currency: documents.currency,
        grandTotal: documents.grandTotal,
        submittedForApprovalAt: documents.submittedForApprovalAt,
        clientName: clients.legalName,
        projectName: projects.name,
        submittedByName: profiles.fullName,
      })
      .from(documents)
      .innerJoin(clients, eq(clients.id, documents.clientId))
      .innerJoin(projects, eq(projects.id, documents.projectId))
      .leftJoin(profiles, eq(profiles.id, documents.submittedBy))
      .where(inArray(documents.status, ['pending_approval']))
      .orderBy(asc(documents.submittedForApprovalAt))
      .limit(100)
  })

  return (
    <>
      <PageHeader
        eyebrow="Director"
        title="Approvals"
        description={
          rows.length === 0
            ? 'Nothing is waiting for you.'
            : `${rows.length} document${rows.length === 1 ? '' : 's'} waiting, oldest first.`
        }
      />

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="Your inbox is clear"
            description="Documents appear here as soon as the Technical Office submits them."
          />
        </Panel>
      ) : (
        <Panel className="divide-y divide-ink-100">
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/approvals/${row.id}`}
              className="block px-4 py-4 transition-colors hover:bg-ink-50 sm:px-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warn">
                  {DOCUMENT_TYPE_LABELS[row.documentType] ?? row.documentType}
                </Badge>
                {row.reference ? (
                  <span className="font-mono text-xs text-ink-400 tabular">{row.reference}</span>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-base font-medium text-ink-900">{row.title}</p>
                {row.grandTotal ? (
                  <p className="text-base font-semibold text-ink-900 tabular">
                    {row.currency} {formatAmount(row.grandTotal)}
                  </p>
                ) : null}
              </div>

              <p className="mt-0.5 text-sm text-ink-600">{row.clientName}</p>
              <p className="mt-1.5 text-xs text-ink-400">
                {row.projectName} · from {row.submittedByName ?? 'the Technical Office'} ·{' '}
                {relativeTime(row.submittedForApprovalAt)}
              </p>
            </Link>
          ))}
        </Panel>
      )}
    </>
  )
}
