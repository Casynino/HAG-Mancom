import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm'
import {
  clientPurchaseOrders,
  clients,
  documentCharges,
  documentEvents,
  documentLines,
  documentVersions,
  documents,
  emailMessages,
  profiles,
  projects,
} from '@/db/schema'
import { DocumentEditor, type LineDraft } from '@/components/document-editor'
import { DocumentEmails } from '@/components/document-emails'
import { DocumentWorkflow } from '@/components/document-workflow'
import { Badge, DescriptionList, Notice, PageHeader, Panel, PanelHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { loadDocumentConfig } from '@/lib/finance/config'
import { isAiConfigured } from '@/lib/ai/provider'
import { formatAmount } from '@/lib/finance/decimal'
import { DOCUMENT_STATUS, DOCUMENT_TYPE_LABELS, formatDate, formatDateTime } from '@/lib/display'

export const metadata: Metadata = { title: 'Document' }

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'document.view')) {
      throw new AuthorizationError('Documents are prepared by the Technical Office.')
    }

    const [row] = await db
      .select({
        doc: documents,
        clientName: clients.legalName,
        projectName: projects.name,
        projectRef: projects.reference,
      })
      .from(documents)
      .innerJoin(clients, eq(clients.id, documents.clientId))
      .innerJoin(projects, eq(projects.id, documents.projectId))
      .where(eq(documents.id, id))
      .limit(1)

    if (!row) return null

    const [lines, charges, events, versions, purchaseOrders, po] = await Promise.all([
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
        .select({ e: documentEvents, actorName: profiles.fullName })
        .from(documentEvents)
        .leftJoin(profiles, eq(profiles.id, documentEvents.actorId))
        .where(eq(documentEvents.documentId, id))
        .orderBy(asc(documentEvents.createdAt)),
      db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, id))
        .orderBy(desc(documentVersions.version)),
      db
        .select()
        .from(clientPurchaseOrders)
        .where(
          and(
            eq(clientPurchaseOrders.projectId, row.doc.projectId),
            ne(clientPurchaseOrders.status, 'cancelled'),
          ),
        )
        .orderBy(desc(clientPurchaseOrders.createdAt)),
      row.doc.clientPurchaseOrderId
        ? db
            .select()
            .from(clientPurchaseOrders)
            .where(eq(clientPurchaseOrders.id, row.doc.clientPurchaseOrderId))
            .limit(1)
        : Promise.resolve([]),
    ])

    // Approved config drives the preview; a gap here is reported, not guessed.
    let config = null
    let configError: string | null = null
    try {
      config = await loadDocumentConfig(db, row.doc.documentType, row.doc.currency)
    } catch (err) {
      configError = err instanceof Error ? err.message : 'Company settings are incomplete.'
    }

    // Every send attempt against this document, newest first.
    const emails = await db
      .select({
        id: emailMessages.id,
        subject: emailMessages.subject,
        toAddresses: emailMessages.toAddresses,
        status: emailMessages.status,
        provider: emailMessages.provider,
        failureReason: emailMessages.failureReason,
        attemptCount: emailMessages.attemptCount,
        queuedAt: emailMessages.queuedAt,
        sentAt: emailMessages.sentAt,
      })
      .from(emailMessages)
      .where(eq(emailMessages.documentId, id))
      .orderBy(desc(emailMessages.queuedAt))

    return {
      ...row,
      emails,
      lines,
      charges,
      events,
      versions,
      purchaseOrders,
      linkedPo: po[0] ?? null,
      config,
      configError,
      canEdit: hasPermission(actor.roles, 'document.edit'),
      canSubmit: hasPermission(actor.roles, 'document.submit'),
      canSend: hasPermission(actor.roles, 'document.send'),
      canIssue: hasPermission(actor.roles, 'document.issue'),
      aiAvailable: isAiConfigured(),
    }
  })

  if (!data) notFound()

  const doc = data.doc
  const status = DOCUMENT_STATUS[doc.status] ?? {
    label: doc.status,
    tone: 'neutral' as const,
  }
  const editable = data.canEdit && (doc.status === 'draft' || doc.status === 'changes_requested')

  const approvedVersion = data.versions.find((v) => v.isApprovedVersion)

  const initialLines: LineDraft[] = data.lines.map((l) => ({
    kind: l.kind,
    description: l.description,
    itemCode: l.itemCode ?? '',
    quantity: l.quantity,
    unit: l.unit ?? '',
    unitPrice: l.unitPrice,
    discountPercent: l.discountPercent ?? '',
  }))

  return (
    <>
      <PageHeader
        back={{ href: '/technical/documents', label: 'Documents' }}
        eyebrow="Technical Office"
        tone="brand"
        title={doc.title}
        description={`${data.clientName} · ${data.projectName} (${data.projectRef})`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
            </Badge>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        }
      />

      {doc.reference ? (
        <p className="font-mono text-sm text-ink-500 tabular">
          {doc.reference}
          {doc.currentVersion > 0 ? ` · version ${doc.currentVersion}` : ''}
        </p>
      ) : (
        <p className="text-sm text-ink-500">
          A reference number is issued when this is submitted for approval, so abandoned drafts
          never consume one.
        </p>
      )}

      {data.configError ? (
        <Notice tone="risk" title="Company settings are incomplete">
          {data.configError}
        </Notice>
      ) : null}

      {doc.status === 'changes_requested' && doc.correctionComment ? (
        <Notice tone="warn" title="The approver asked for a correction">
          {doc.correctionComment}
        </Notice>
      ) : null}

      {doc.status === 'rejected' && doc.correctionComment ? (
        <Notice tone="risk" title="Rejected">
          {doc.correctionComment}
        </Notice>
      ) : null}

      {approvedVersion ? (
        <Notice tone="ok" title="Approved and locked">
          This document was approved on {formatDate(doc.approvedAt)} and cannot be edited. A
          correction requires a new revision.
          <span className="mt-1 block font-mono text-xs">
            Content hash {approvedVersion.contentHash.slice(0, 16)}…
          </span>
        </Notice>
      ) : null}

      {data.config ? (
        <DocumentEditor
          documentId={doc.id}
          submissionId={doc.sourceSubmissionId}
          editable={editable}
          currency={doc.currency}
          documentType={doc.documentType}
          clientId={doc.clientId}
          decimalPlaces={data.config.rounding.decimalPlaces}
          taxLabel={data.config.tax?.label ?? null}
          taxRatePercent={data.config.tax?.ratePercent ?? null}
          charges={data.config.charges.map((c) => ({
            label: c.label,
            ratePercent: c.ratePercent,
            appliesBeforeVat: c.appliesBeforeVat,
          }))}
          initial={{
            title: doc.title,
            scopeDescription: doc.scopeDescription ?? '',
            servicePeriodLabel: doc.servicePeriodLabel ?? '',
            clientReference: doc.clientReference ?? '',
            documentDate: doc.documentDate ?? '',
            filename: doc.filename ?? '',
            bodyContent: doc.bodyContent ?? '',
            terms: (doc.terms as Record<string, string>) ?? {},
          }}
          initialLines={initialLines}
          aiAvailable={data.aiAvailable}
        />
      ) : null}

      {/* Stored figures, as the server computed them. */}
      {doc.grandTotal ? (
        <Panel>
          <PanelHeader
            title="Stored figures"
            description="Computed on the server from approved settings. These are what the document carries."
          />
          <div className="px-4 sm:px-5">
            <DescriptionList
              items={[
                ['Sub total', `${doc.currency} ${formatAmount(doc.subTotal ?? '0')}`],
                ...data.charges.map(
                  (c) =>
                    [
                      `${c.label} (${c.ratePercent}%)`,
                      `${doc.currency} ${formatAmount(c.amount)}`,
                    ] as [string, string],
                ),
                [
                  doc.taxLabel ? `${doc.taxLabel} (${doc.taxRatePercent}%)` : 'Tax',
                  `${doc.currency} ${formatAmount(doc.taxAmount ?? '0')}`,
                ],
                [
                  'Grand total',
                  <span className="font-semibold">
                    {doc.currency} {formatAmount(doc.grandTotal)}
                  </span>,
                ],
                [
                  'Rounding applied',
                  doc.roundingPolicy
                    ? `${(doc.roundingPolicy as { decimalPlaces: number }).decimalPlaces} decimals, ${(doc.roundingPolicy as { mode: string }).mode.replace('_', ' ')}, at ${(doc.roundingPolicy as { roundAtStep: string }).roundAtStep.replace('_', ' ')}`
                    : '—',
                ],
              ]}
            />
          </div>
        </Panel>
      ) : null}

      <DocumentWorkflow
        documentId={doc.id}
        documentType={doc.documentType}
        status={doc.status}
        reference={doc.reference}
        linkedPoNumber={data.linkedPo?.poNumber ?? null}
        purchaseOrders={data.purchaseOrders.map((p) => ({
          id: p.id,
          poNumber: p.poNumber,
          status: p.status,
        }))}
        hasApprovedVersion={Boolean(approvedVersion)}
        canSubmit={data.canSubmit && editable}
        canSend={data.canSend}
        canIssue={data.canIssue}
      />

      <DocumentEmails
        messages={data.emails.map((m) => ({
          ...m,
          queuedAt: m.queuedAt.toISOString(),
          sentAt: m.sentAt?.toISOString() ?? null,
        }))}
        canSend={data.canSend}
      />

      {/* ---------------- Versions ---------------- */}
      {data.versions.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Version history"
            description="Every submitted and approved version is preserved, unsigned copy included."
          />
          <div className="divide-y divide-ink-100">
            {data.versions.map((v) => (
              <div key={v.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">Version {v.version}</span>
                    {v.isApprovedVersion ? <Badge tone="ok">Approved</Badge> : null}
                    {v.signatureApplied ? <Badge tone="brand">Signed</Badge> : null}
                    {v.stampApplied ? <Badge tone="brand">Stamped</Badge> : null}
                  </div>
                  <span className="text-xs text-ink-400">{formatDateTime(v.createdAt)}</span>
                </div>

                <p className="mt-0.5 text-sm text-ink-500">{v.changeSummary}</p>
                <p className="mt-1 font-mono text-xs text-ink-400">{v.contentHash.slice(0, 32)}…</p>

                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  {v.signedPdfStorageKey ? (
                    <a
                      href={`/api/documents/${doc.id}/signed`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-700 hover:underline"
                    >
                      Signed PDF
                    </a>
                  ) : null}
                  {v.pdfStorageKey ? (
                    <a
                      href={`/api/documents/${doc.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-700 hover:underline"
                    >
                      Unsigned PDF
                    </a>
                  ) : null}
                  {v.docxStorageKey ? (
                    <a
                      href={`/api/documents/${doc.id}/docx`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      Editable DOCX
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {/* ---------------- History ---------------- */}
      <Panel>
        <PanelHeader title="History" />
        <ol className="divide-y divide-ink-100 px-4 sm:px-5">
          {data.events.map(({ e, actorName }) => (
            <li key={e.id} className="py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink-900">
                  {e.action.replace(/_/g, ' ')}
                  {actorName ? (
                    <span className="font-normal text-ink-500"> — {actorName}</span>
                  ) : null}
                </span>
                <span className="text-xs text-ink-400">{formatDateTime(e.createdAt)}</span>
              </div>
              {e.comment ? <p className="mt-0.5 text-sm text-ink-600">{e.comment}</p> : null}
            </li>
          ))}
        </ol>
      </Panel>
    </>
  )
}
