import Link from 'next/link'
import type { Metadata } from 'next'
import { and, asc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import {
  approvalPolicies,
  clients,
  companyAssets,
  documents,
  profiles,
  projects,
} from '@/db/schema'
import { ApprovalDecision } from '@/components/approval-decision'
import { CheckCircle2, FileText, PenLine, Stamp, Wallet } from 'lucide-react'
import {
  Badge,
  EmptyState,
  MetricCard,
  Notice,
  PageHeader,
  Panel,
  SectionBar,
} from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { canApplySignature, canApplyStamp, hasPermission } from '@/lib/authz/roles'
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

    const [rows, approvedThisMonth, pendingValue, ownSignature, policies, stamp] =
      await Promise.all([
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

        db
          .select({
            documentType: approvalPolicies.documentType,
            requiresSignature: approvalPolicies.requiresSignature,
            requiresStamp: approvalPolicies.requiresStamp,
          })
          .from(approvalPolicies)
          .where(eq(approvalPolicies.state, 'approved')),

        db
          .select({ id: companyAssets.id })
          .from(companyAssets)
          .where(and(eq(companyAssets.kind, 'stamp'), eq(companyAssets.state, 'approved')))
          .limit(1),
      ])

    return {
      rows,
      approvedThisMonth: approvedThisMonth[0]?.count ?? 0,
      pendingValue: pendingValue[0]?.total ?? '0',
      hasSignature: ownSignature.length > 0,
      hasStamp: stamp.length > 0,
      maySign: canApplySignature(actor.roles),
      mayStamp: canApplyStamp(actor.roles),
      // Keyed by document type so each card can be told what its own approval
      // actually requires, rather than guessing or hiding the controls.
      policyByType: Object.fromEntries(
        policies.map((pol) => [
          pol.documentType,
          { requiresSignature: pol.requiresSignature, requiresStamp: pol.requiresStamp },
        ]),
      ) as Record<string, { requiresSignature: boolean; requiresStamp: boolean } | undefined>,
    }
  })

  const { rows } = data

  return (
    <>
      <PageHeader
        eyebrow="Director Portal"
        title="Executive approvals"
        description="Review and approve with your signature and the company stamp applied automatically — from any device."
        stats={[
          { label: 'waiting on you', value: rows.length },
          {
            label: 'already numbered',
            value: rows.filter((r) => r.reference).length,
          },
        ]}
      />

      <SectionBar
        label="Waiting on your decision"
        scope="Numbered and locked at submission · nothing reaches a client until you sign"
        tone={rows.length > 0 ? 'warn' : 'ok'}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          index={0}
          label="Awaiting your decision"
          value={rows.length}
          note={rows.length === 0 ? 'nothing waiting' : 'oldest first — they have been numbered'}
          href="#queue"
          tone={rows.length > 0 ? 'warn' : 'neutral'}
          icon={<Stamp className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          index={1}
          label="Approved this month"
          value={data.approvedThisMonth}
          note="signed and sealed by you"
          href="/repository"
          tone="ok"
          icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
        />
        <MetricCard
          index={2}
          label="Pending value"
          prefix="TZS"
          value={formatAmount(Decimal.from(data.pendingValue), 0)}
          note="the total sitting on your desk, unsigned"
          href="#queue"
          tone="brand"
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
        <div id="queue" className="scroll-mt-24 space-y-4">
          {rows.map((row, i) => {
            const policy = data.policyByType[row.documentType]
            return (
              <Panel key={row.id} className="overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="warn">
                      {DOCUMENT_TYPE_LABELS[row.documentType] ?? row.documentType}
                    </Badge>
                    {row.reference ? (
                      <span className="font-mono text-xs text-ink-400 tabular">
                        {row.reference}
                      </span>
                    ) : null}
                    <Link
                      href={`/approvals/${row.id}`}
                      className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
                    >
                      <FileText className="size-4" aria-hidden="true" />
                      Read it in full
                    </Link>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-3">
                    <p className="font-display text-base font-semibold text-ink-950">{row.title}</p>
                    {row.grandTotal ? (
                      <p className="font-display flex items-baseline gap-1.5 tabular">
                        <span className="text-xs font-semibold text-ink-500">{row.currency}</span>
                        <span className="text-xl font-bold text-ink-950">
                          {formatAmount(row.grandTotal)}
                        </span>
                      </p>
                    ) : null}
                  </div>

                  <p className="mt-1 text-sm text-ink-600">{row.clientName}</p>
                  <p className="mt-1 text-xs text-ink-400">
                    {row.projectName} · from {row.submittedByName ?? 'the Technical Office'} ·{' '}
                    {relativeTime(row.submittedForApprovalAt)}
                  </p>
                </div>

                {/*
                 * The decision, on the card. A Director should be able to clear
                 * three straightforward letters without opening three pages.
                 * It is the same component the detail page uses, so the
                 * signature and stamp rules cannot drift between the two — and
                 * the real enforcement is a database trigger either way.
                 */}
                <div className="border-t border-ink-200 bg-ink-50/60 p-4 sm:p-5">
                  <ApprovalDecision
                    compact
                    documentId={row.id}
                    requiresSignature={policy?.requiresSignature ?? false}
                    requiresStamp={policy?.requiresStamp ?? false}
                    maySign={data.maySign}
                    mayStamp={data.mayStamp}
                    hasOwnSignature={data.hasSignature}
                    hasStamp={data.hasStamp}
                  />
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </>
  )
}
