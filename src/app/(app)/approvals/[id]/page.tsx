import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { and, asc, desc, eq } from 'drizzle-orm'
import {
  approvalPolicies,
  clientPurchaseOrders,
  clients,
  companyAssets,
  documentCharges,
  documentLines,
  documentVersions,
  documents,
  profiles,
  projects,
} from '@/db/schema'
import { ApprovalDecision } from '@/components/approval-decision'
import { Badge, DescriptionList, Notice, PageHeader, Panel, PanelHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { canApplySignature, canApplyStamp, hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { formatAmount } from '@/lib/finance/decimal'
import { DOCUMENT_TYPE_LABELS, formatDate } from '@/lib/display'

export const metadata: Metadata = { title: 'Approve document' }

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'approval.decide')) {
      throw new AuthorizationError('The approval inbox is for Directors.')
    }

    const [row] = await db
      .select({
        doc: documents,
        clientName: clients.legalName,
        clientTin: clients.tin,
        projectName: projects.name,
        projectRef: projects.reference,
      })
      .from(documents)
      .innerJoin(clients, eq(clients.id, documents.clientId))
      .innerJoin(projects, eq(projects.id, documents.projectId))
      .where(eq(documents.id, id))
      .limit(1)

    if (!row) return null

    const [lines, charges, policy, po, submitter, version, signature, stamp] = await Promise.all([
      db
        .select()
        .from(documentLines)
        .where(eq(documentLines.documentId, id))
        .orderBy(asc(documentLines.position)),
      db
        .select()
        .from(documentCharges)
        .where(eq(documentCharges.documentId, id))
        .orderBy(asc(documentCharges.position)),
      db
        .select()
        .from(approvalPolicies)
        .where(
          and(
            eq(approvalPolicies.documentType, row.doc.documentType),
            eq(approvalPolicies.state, 'approved'),
          ),
        )
        .limit(1),
      row.doc.clientPurchaseOrderId
        ? db
            .select()
            .from(clientPurchaseOrders)
            .where(eq(clientPurchaseOrders.id, row.doc.clientPurchaseOrderId))
            .limit(1)
        : Promise.resolve([]),
      row.doc.submittedBy
        ? db
            .select({ id: profiles.id, fullName: profiles.fullName })
            .from(profiles)
            .where(eq(profiles.id, row.doc.submittedBy))
            .limit(1)
        : Promise.resolve([]),
      db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, id))
        .orderBy(desc(documentVersions.version))
        .limit(1),
      // A Director may only ever apply their OWN signature.
      db
        .select()
        .from(companyAssets)
        .where(
          and(
            eq(companyAssets.kind, 'signature'),
            eq(companyAssets.state, 'approved'),
            eq(companyAssets.ownerUserId, actor.id),
          ),
        )
        .limit(1),
      db
        .select()
        .from(companyAssets)
        .where(and(eq(companyAssets.kind, 'stamp'), eq(companyAssets.state, 'approved')))
        .limit(1),
    ])

    return {
      ...row,
      lines,
      charges,
      policy: policy[0] ?? null,
      po: po[0] ?? null,
      submitter: submitter[0] ?? null,
      latestVersion: version[0] ?? null,
      hasOwnSignature: signature.length > 0,
      hasStamp: stamp.length > 0,
      maySign: canApplySignature(actor.roles),
      mayStamp: canApplyStamp(actor.roles),
      actorRoles: actor.roles,
    }
  })

  if (!data) notFound()

  const doc = data.doc
  const decidable = doc.status === 'pending_approval'

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/approvals" className="hover:underline">
            ← Approvals
          </Link>
        }
        title={doc.title}
        description={`${data.clientName} · ${data.projectName}`}
        action={
          <Badge tone="warn">{DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}</Badge>
        }
      />

      {!decidable ? (
        <Notice tone="neutral">
          This document is {doc.status.replace(/_/g, ' ')} and is no longer waiting for a decision.
        </Notice>
      ) : null}

      {/* ---------------- The numbers, first ---------------- */}
      {doc.grandTotal ? (
        <Panel>
          <div className="px-4 py-4 sm:px-5">
            <p className="text-xs font-medium tracking-wider text-ink-500 uppercase">
              Total to approve
            </p>
            <p className="mt-1 text-3xl font-semibold text-ink-900 tabular">
              {doc.currency} {formatAmount(doc.grandTotal)}
            </p>

            <dl className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-sm">
              <div className="flex justify-between gap-6">
                <dt className="text-ink-600">Sub total</dt>
                <dd className="text-ink-900 tabular">{formatAmount(doc.subTotal ?? '0')}</dd>
              </div>
              {data.charges.map((c) => (
                <div key={c.id} className="flex justify-between gap-6">
                  <dt className="text-ink-600">
                    {c.label} ({c.ratePercent}%)
                  </dt>
                  <dd className="text-ink-900 tabular">{formatAmount(c.amount)}</dd>
                </div>
              ))}
              {doc.taxRatePercent ? (
                <div className="flex justify-between gap-6">
                  <dt className="text-ink-600">
                    {doc.taxLabel ?? 'VAT'} ({doc.taxRatePercent}%)
                  </dt>
                  <dd className="text-ink-900 tabular">{formatAmount(doc.taxAmount ?? '0')}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </Panel>
      ) : null}

      {/* ---------------- Key facts ---------------- */}
      <Panel>
        <PanelHeader title="What you are approving" />
        <div className="px-4 sm:px-5">
          <DescriptionList
            items={[
              ['Reference', doc.reference ?? 'Not yet issued'],
              ['Client', data.clientName],
              ['Client TIN', data.clientTin ?? 'Not on file'],
              ['Project', `${data.projectName} (${data.projectRef})`],
              [
                'Client Purchase Order',
                data.po ? (
                  <span className="font-mono">{data.po.poNumber}</span>
                ) : doc.documentType === 'tax_invoice' ? (
                  <span className="text-risk-600">Missing</span>
                ) : (
                  'Not applicable'
                ),
              ],
              ['Scope', doc.scopeDescription ?? '—'],
              ['Document date', formatDate(doc.documentDate)],
              ['Prepared by', data.submitter?.fullName ?? '—'],
            ]}
          />
        </div>
      </Panel>

      {/* ---------------- Lines ---------------- */}
      {data.lines.length > 0 ? (
        <Panel>
          <PanelHeader title="Line items" />
          <div className="divide-y divide-ink-100">
            {data.lines.map((line) => (
              <div key={line.id} className="px-4 py-3 sm:px-5">
                <p className="text-sm text-ink-900">{line.description}</p>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-ink-500">
                  <span className="tabular">
                    {line.quantity} {line.unit ?? ''} × {formatAmount(line.unitPrice)}
                  </span>
                  <span className="font-medium text-ink-900 tabular">
                    {formatAmount(line.lineTotal)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {/* ---------------- The document itself ---------------- */}
      {data.latestVersion?.pdfStorageKey ? (
        <Panel>
          <PanelHeader
            title="The document"
            description="Read it before deciding. This is exactly what was submitted."
          />
          <div className="p-4 sm:p-5">
            <a
              href={`/api/documents/${doc.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-lg flex w-full items-center justify-center rounded border border-ink-300 bg-white px-5 font-medium text-ink-800 hover:bg-ink-50"
            >
              Open the PDF
            </a>
            <p className="mt-2 font-mono text-xs text-ink-400">
              Content hash {data.latestVersion.contentHash.slice(0, 24)}…
            </p>
          </div>
        </Panel>
      ) : (
        <Notice tone="warn">
          No rendering is available for this version. Ask the Technical Office to render a preview
          before you approve it.
        </Notice>
      )}

      {/* ---------------- Decision ---------------- */}
      {decidable ? (
        <ApprovalDecision
          documentId={doc.id}
          requiresSignature={data.policy?.requiresSignature ?? false}
          requiresStamp={data.policy?.requiresStamp ?? false}
          maySign={data.maySign}
          mayStamp={data.mayStamp}
          hasOwnSignature={data.hasOwnSignature}
          hasStamp={data.hasStamp}
        />
      ) : null}
    </>
  )
}
