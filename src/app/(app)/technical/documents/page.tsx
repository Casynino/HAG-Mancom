import Link from 'next/link'
import type { Metadata } from 'next'
import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { clientPurchaseOrders, clients, documents, profiles, projects } from '@/db/schema'
import { DocumentCreateForm } from '@/components/document-create-form'
import { Badge, EmptyState, Notice, PageHeader, Panel } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { checkConfigReadiness } from '@/lib/finance/config'
import { formatAmount } from '@/lib/finance/decimal'
import { DOCUMENT_STATUS, DOCUMENT_TYPE_LABELS, relativeTime } from '@/lib/display'

export const metadata: Metadata = { title: 'Documents' }

export default async function DocumentsPage() {
  const { rows, readiness, canCreate, projectOptions, poOptions, currencies } =
    await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'document.view')) {
      throw new AuthorizationError('Documents are prepared by the Technical Office.')
    }

    const result = await db
      .select({
        id: documents.id,
        reference: documents.reference,
        documentType: documents.documentType,
        title: documents.title,
        status: documents.status,
        currency: documents.currency,
        grandTotal: documents.grandTotal,
        updatedAt: documents.updatedAt,
        submittedForApprovalAt: documents.submittedForApprovalAt,
        clientName: clients.legalName,
        projectName: projects.name,
        preparedByName: profiles.fullName,
      })
      .from(documents)
      .innerJoin(clients, eq(clients.id, documents.clientId))
      .innerJoin(projects, eq(projects.id, documents.projectId))
      .leftJoin(profiles, eq(profiles.id, documents.preparedBy))
      .orderBy(desc(documents.updatedAt))
      .limit(200)

    // Surfaced up front rather than at submission time, so a Technical Officer
    // is never halfway through a quotation before learning it cannot be issued.
    const quotationReadiness = await checkConfigReadiness(db, 'quotation', 'TZS')

    // What the "start a document" form needs to offer real choices rather than
    // free text: live projects, the Purchase Orders the clients actually sent,
    // and the currencies an approved rounding policy exists for.
    const [projectRows, poRows, currencyRows] = await Promise.all([
      db
        .select({
          id: projects.id,
          name: projects.name,
          reference: projects.reference,
          clientName: clients.legalName,
        })
        .from(projects)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .where(inArray(projects.status, ['planning', 'active', 'on_hold']))
        .orderBy(asc(clients.legalName), asc(projects.name)),

      db
        .select({
          id: clientPurchaseOrders.id,
          projectId: clientPurchaseOrders.projectId,
          poNumber: clientPurchaseOrders.poNumber,
        })
        .from(clientPurchaseOrders)
        .where(inArray(clientPurchaseOrders.status, ['open', 'partially_fulfilled']))
        .orderBy(desc(clientPurchaseOrders.createdAt)),

      db.execute(sql`
        select distinct currency from public.rounding_policies
        where state = 'approved' order by currency`),
    ])

    const approvedCurrencies = (currencyRows.rows as Array<{ currency: string }>).map(
      (r) => r.currency,
    )

    return {
      rows: result,
      readiness: quotationReadiness,
      canCreate: hasPermission(actor.roles, 'document.create'),
      projectOptions: projectRows,
      poOptions: poRows,
      // Never an empty select: if no policy is approved yet the readiness
      // notice above already explains why nothing can be issued.
      currencies: approvedCurrencies.length > 0 ? approvedCurrencies : ['TZS'],
    }
  })

  const open = rows.filter((r) => ['draft', 'changes_requested', 'rejected'].includes(r.status))
  const awaiting = rows.filter((r) => ['pending_review', 'pending_approval'].includes(r.status))
  const done = rows.filter((r) => ['approved', 'issued'].includes(r.status))
  const closed = rows.filter((r) => ['archived', 'cancelled'].includes(r.status))

  return (
    <>
      <PageHeader
        eyebrow="Technical Office"
        title="Documents"
        description="Quotations, invoices, delivery notes, letters and certificates."
      />

      {!readiness.ready ? (
        <Notice tone="warn" title="Company settings must be approved before documents can be issued">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {readiness.missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          <p className="mt-2">
            An Administrator resolves these in{' '}
            <Link href="/admin/settings" className="font-medium underline">
              Company settings
            </Link>
            .
          </p>
        </Notice>
      ) : null}

      {canCreate && readiness.ready ? (
        <>
          <DocumentCreateForm
            projects={projectOptions}
            purchaseOrders={poOptions}
            currencies={currencies}
          />
          <div className="flex flex-wrap gap-2">
            <Link
              href="/technical"
              className="tap inline-flex items-center rounded border border-ink-300 bg-panel px-4 text-sm font-medium text-ink-800 hover:bg-ink-50"
            >
              Start a quotation from a site submission
            </Link>
          </div>
        </>
      ) : null}

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="No documents yet"
            description="Quotations are drafted from accepted site submissions. Accept one in the review queue to begin."
          />
        </Panel>
      ) : null}

      {open.length > 0 ? <Section title="Being prepared" rows={open} /> : null}
      {awaiting.length > 0 ? <Section title="With the approver" rows={awaiting} /> : null}
      {done.length > 0 ? <Section title="Approved" rows={done} /> : null}
      {closed.length > 0 ? <Section title="Closed" rows={closed} muted /> : null}
    </>
  )
}

type Row = {
  id: string
  reference: string | null
  documentType: string
  title: string
  status: string
  currency: string
  grandTotal: string | null
  updatedAt: Date
  submittedForApprovalAt: Date | null
  clientName: string
  projectName: string
  preparedByName: string | null
}

function Section({ title, rows, muted }: { title: string; rows: Row[]; muted?: boolean }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-xs font-semibold tracking-wider text-ink-500 uppercase">{title}</h2>
        <span className="text-xs text-ink-400 tabular">{rows.length}</span>
      </div>
      <Panel className="divide-y divide-ink-100">
        {rows.map((row) => {
          const status = DOCUMENT_STATUS[row.status] ?? { label: row.status, tone: 'neutral' as const }
          return (
            <Link
              key={row.id}
              href={`/technical/documents/${row.id}`}
              className={`block px-4 py-3.5 transition-colors hover:bg-ink-50 sm:px-5 ${muted ? 'opacity-70' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">
                  {DOCUMENT_TYPE_LABELS[row.documentType] ?? row.documentType}
                </Badge>
                <Badge tone={status.tone}>{status.label}</Badge>
                {row.reference ? (
                  <span className="font-mono text-xs text-ink-400 tabular">{row.reference}</span>
                ) : (
                  <span className="text-xs text-ink-400">No reference yet</span>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink-900">{row.title}</p>
                {row.grandTotal ? (
                  <p className="text-sm font-medium text-ink-900 tabular">
                    {row.currency} {formatAmount(row.grandTotal)}
                  </p>
                ) : null}
              </div>

              <p className="mt-0.5 text-sm text-ink-500">
                {row.clientName} · {row.projectName}
              </p>
              <p className="mt-1.5 text-xs text-ink-400">
                {row.preparedByName ? `${row.preparedByName} · ` : ''}
                {row.submittedForApprovalAt
                  ? `submitted ${relativeTime(row.submittedForApprovalAt)}`
                  : `updated ${relativeTime(row.updatedAt)}`}
              </p>
            </Link>
          )
        })}
      </Panel>
    </section>
  )
}
