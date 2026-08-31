import Link from 'next/link'
import type { Metadata } from 'next'
import { and, asc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { clients, companyAssets, documents, profiles, projects } from '@/db/schema'
import { CheckCircle2, PenLine, Stamp, Wallet } from 'lucide-react'
import { Badge, EmptyState, Notice, PageHeader, Panel, StatCard } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { Decimal, formatAmount } from '@/lib/finance/decimal'
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
  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'approval.decide')) {
      throw new AuthorizationError('The approval inbox is for Directors.')
    }

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

    const [rows, approvedThisMonth, pendingValue, ownSignature] = await Promise.all([
      db
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
        .limit(100),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .where(and(eq(documents.approvedBy, actor.id), gte(documents.approvedAt, monthStart))),

      db
        .select({ total: sql<string>`coalesce(sum(${documents.grandTotal}), 0)::text` })
        .from(documents)
        .where(eq(documents.status, 'pending_approval')),

      // A signature belongs to the Director it is for; nobody can supply one on
      // their behalf, so this checks for *theirs*, not merely any signature.
      db
        .select({ id: companyAssets.id })
        .from(companyAssets)
        .where(
          and(
            eq(companyAssets.kind, 'signature'),
            eq(companyAssets.ownerUserId, actor.id),
            eq(companyAssets.state, 'approved'),
          ),
        )
        .limit(1),
    ])

    return {
      rows,
      approvedThisMonth: approvedThisMonth[0]?.count ?? 0,
      pendingValue: pendingValue[0]?.total ?? '0',
      hasSignature: ownSignature.length > 0,
    }
  })

  const { rows } = data

  return (
    <>
      <PageHeader
        eyebrow="Director Portal"
        title="Executive approvals"
        description="Review and approve with your signature and the company stamp applied automatically — from any device."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Awaiting your decision"
          value={rows.length}
          meta={rows.length === 0 ? 'Nothing waiting' : 'Oldest first'}
          href="#queue"
          tone={rows.length > 0 ? 'warn' : 'neutral'}
          icon={<Stamp className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Approved this month"
          value={data.approvedThisMonth}
          meta="By you"
          href="/repository"
          tone="ok"
          icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
        />
        <StatCard
          label="Pending value"
          value={`TZS ${formatAmount(Decimal.from(data.pendingValue), 0)}`}
          meta="Across the queue"
          href="#queue"
          icon={<Wallet className="size-4" aria-hidden="true" />}
        />
      </div>

      {!data.hasSignature ? (
        <Notice tone="warn" title="No signature image is on file">
          <p>
            Documents whose approval policy requires a signature cannot be approved until you upload
            yours. Only you can — a signature is bound to the person it belongs to, and nobody may
            supply one on your behalf.
          </p>
          <Link
            href="/admin/assets"
            className="mt-2 inline-flex items-center gap-1.5 font-medium underline"
          >
            <PenLine className="size-4" aria-hidden="true" />
            Upload your signature
          </Link>
        </Notice>
      ) : null}

      {rows.length === 0 ? (
        <Panel id="queue">
          <EmptyState
            title="Your inbox is clear"
            description="Documents appear here as soon as the Technical Office submits them."
          />
        </Panel>
      ) : (
        <Panel id="queue" className="scroll-mt-24 divide-y divide-ink-100">
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
