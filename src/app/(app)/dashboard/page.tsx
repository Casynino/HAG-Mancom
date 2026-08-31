import Link from 'next/link'
import type { Metadata } from 'next'
import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import {
  clients,
  complianceRecords,
  complianceTypes,
  documents,
  engineerSubmissions,
  profiles,
  projects,
} from '@/db/schema'
import { ArrowRight, FilePlus2, FileText, HardHat, ShieldCheck, Stamp } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  AttentionItem,
  RankedList,
  SectionBar,
  SplitBar,
  Badge,
  BannerPill,
  Desk,
  DeskGrid,
  EmptyState,
  Panel,
  PanelHeader,
  QuickAction,
  QuickActions,
  SectionHead,
  Stat,
  StatChip,
  StatStrip,
  WelcomeBanner,
} from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission, ROLE_LABELS } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { Decimal, formatAmount } from '@/lib/finance/decimal'
import {
  DOCUMENT_STATUS,
  DOCUMENT_TYPE_LABELS,
  formatDate,
  relativeTime,
  SUBMISSION_STATUS,
  URGENCY,
  type SubmissionStatus,
  type Urgency,
} from '@/lib/display'

export const metadata: Metadata = { title: 'Operations Command Centre' }

/**
 * The command centre.
 *
 * It answers four questions in the order somebody actually asks them on
 * arriving at work: what is waiting on me, what is moving, what is at risk, and
 * what can I start. Every figure is computed from the records in the same
 * request that renders them — nothing is a stored counter that could drift from
 * what the tables actually say — and every figure links to the thing it counts,
 * because a number demanding attention should take you to it.
 *
 * Deliberately absent: vanity totals. "Documents issued this year" tells a
 * Technical Officer nothing they can act on before lunch.
 */

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardPage() {
  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'submission.view_all')) {
      throw new AuthorizationError('This overview is for the Technical Office and Directors.')
    }

    const today = new Date()
    const todayIso = today.toISOString().slice(0, 10)
    const in90 = new Date(today.getTime() + 90 * 86_400_000).toISOString().slice(0, 10)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

    const [
      submissionCounts,
      documentCounts,
      approvedValue,
      recentDocuments,
      latestSubmissions,
      expiring,
      approvedThisMonth,
      activeProjects,
      topClients,
      byType,
    ] = await Promise.all([
      db
        .select({ status: engineerSubmissions.status, count: sql<number>`count(*)::int` })
        .from(engineerSubmissions)
        .groupBy(engineerSubmissions.status),

      db
        .select({ status: documents.status, count: sql<number>`count(*)::int` })
        .from(documents)
        .groupBy(documents.status),

      // Only what a Director has actually signed off. A draft total is a guess.
      db
        .select({ total: sql<string>`coalesce(sum(${documents.grandTotal}), 0)::text` })
        .from(documents)
        .where(
          and(
            inArray(documents.status, ['approved', 'issued']),
            inArray(documents.documentType, ['quotation', 'tax_invoice']),
          ),
        ),

      db
        .select({
          id: documents.id,
          reference: documents.reference,
          documentType: documents.documentType,
          title: documents.title,
          status: documents.status,
          currency: documents.currency,
          grandTotal: documents.grandTotal,
          updatedAt: documents.updatedAt,
          clientName: clients.legalName,
        })
        .from(documents)
        .innerJoin(clients, eq(clients.id, documents.clientId))
        .orderBy(desc(documents.updatedAt))
        .limit(5),

      db
        .select({
          id: engineerSubmissions.id,
          title: engineerSubmissions.title,
          problem: engineerSubmissions.problemDescription,
          status: engineerSubmissions.status,
          urgency: engineerSubmissions.urgency,
          submittedAt: engineerSubmissions.submittedAt,
          clientName: clients.legalName,
          engineerName: profiles.fullName,
        })
        .from(engineerSubmissions)
        .innerJoin(clients, eq(clients.id, engineerSubmissions.clientId))
        .innerJoin(profiles, eq(profiles.id, engineerSubmissions.submittedBy))
        .where(inArray(engineerSubmissions.status, ['submitted', 'under_review']))
        .orderBy(desc(engineerSubmissions.submittedAt))
        .limit(4),

      db
        .select({
          id: complianceRecords.id,
          label: complianceTypes.label,
          authority: complianceTypes.authority,
          expiresOn: complianceRecords.expiresOn,
        })
        .from(complianceRecords)
        .innerJoin(complianceTypes, eq(complianceTypes.id, complianceRecords.complianceTypeId))
        .where(
          and(
            isNull(complianceRecords.supersededAt),
            lte(complianceRecords.expiresOn, in90),
            gte(complianceRecords.expiresOn, todayIso),
          ),
        )
        .orderBy(complianceRecords.expiresOn)
        .limit(4),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .where(
          and(
            inArray(documents.status, ['approved', 'issued']),
            gte(documents.approvedAt, monthStart),
          ),
        ),

      db
        .select({ count: sql<number>`count(*)::int` })
        .from(projects)
        .where(and(eq(projects.status, 'active'), isNull(projects.archivedAt))),

      // Who the work is actually for, by approved value. Ranked against each
      // other, not against a total, because the question is who is largest.
      db
        .select({
          name: clients.legalName,
          value: sql<string>`coalesce(sum(${documents.grandTotal}), 0)::text`,
          documents: sql<number>`count(*)::int`,
        })
        .from(documents)
        .innerJoin(clients, eq(clients.id, documents.clientId))
        .where(inArray(documents.status, ['approved', 'issued']))
        .groupBy(clients.id, clients.legalName)
        .orderBy(sql`sum(${documents.grandTotal}) desc nulls last`)
        .limit(5),

      // What the office actually produces, by count.
      db
        .select({
          documentType: documents.documentType,
          count: sql<number>`count(*)::int`,
        })
        .from(documents)
        .groupBy(documents.documentType)
        .orderBy(sql`count(*) desc`)
        .limit(6),
    ])

    const total = (rows: Array<{ status: string; count: number }>, ...want: string[]) =>
      rows.filter((r) => want.includes(r.status)).reduce((n, r) => n + r.count, 0)

    return {
      actorName: actor.fullName,
      actorRoles: actor.roles.map((r) => ROLE_LABELS[r]),
      drafts: total(documentCounts, 'draft'),
      awaitingApproval: total(documentCounts, 'pending_approval', 'pending_review'),
      openWorkRequests: total(submissionCounts, 'submitted', 'under_review'),
      documentsIssued: total(documentCounts, 'approved', 'issued'),
      approvedValue: approvedValue[0]?.total ?? '0',
      approvedThisMonth: approvedThisMonth[0]?.count ?? 0,
      activeProjects: activeProjects[0]?.count ?? 0,
      recentDocuments,
      latestSubmissions,
      expiring,
      topClients,
      byType,
      canCreateDocument: hasPermission(actor.roles, 'document.create'),
      canSubmit: hasPermission(actor.roles, 'submission.create'),
    }
  })

  const now = new Date()

  /*
   * What is genuinely waiting on this person, worst first. Each line says what
   * is wrong in plain words rather than restating the count — a number the
   * reader has to interpret is a number they will skip.
   */
  const attention: Array<{
    href: string
    title: string
    line: string
    tone: 'warn' | 'risk' | 'brand'
    icon: ReactNode
  }> = []

  if (data.expiring.length > 0) {
    attention.push({
      href: '/compliance',
      title: `${data.expiring.length} certificate${data.expiring.length === 1 ? '' : 's'} lapse within 90 days`,
      line: data.expiring.map((e) => `${e.label} — ${formatDate(e.expiresOn)}`).join(' · '),
      tone: 'risk',
      icon: <ShieldCheck className="size-4" aria-hidden="true" />,
    })
  }
  if (data.awaitingApproval > 0) {
    attention.push({
      href: '/approvals',
      title: `${data.awaitingApproval} document${data.awaitingApproval === 1 ? '' : 's'} with the Director`,
      line: 'Numbered and locked. Nothing reaches a client until one of these is signed.',
      tone: 'warn',
      icon: <Stamp className="size-4" aria-hidden="true" />,
    })
  }
  if (data.openWorkRequests > 0) {
    attention.push({
      href: '/technical',
      title: `${data.openWorkRequests} site report${data.openWorkRequests === 1 ? '' : 's'} not yet written up`,
      line: 'An engineer has been to site. Nobody has turned it into a document yet.',
      tone: 'brand',
      icon: <HardHat className="size-4" aria-hidden="true" />,
    })
  }

  return (
    <>
      <WelcomeBanner
        greeting={greeting(now.getHours())}
        name={data.actorName.split(' ')[0]!}
        line="Here is the whole operation, and what is waiting on you."
        pills={
          <>
            <BannerPill dot>{formatDate(now.toISOString().slice(0, 10))}</BannerPill>
            {data.actorRoles.map((role) => (
              <BannerPill key={role}>{role.toUpperCase()}</BannerPill>
            ))}
          </>
        }
        actions={
          <>
            {data.canSubmit ? (
              <Link
                href="/engineer/new"
                className="tap inline-flex items-center gap-2 rounded-lg border border-white/25 px-4 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                <HardHat className="size-4" aria-hidden="true" />
                New work request
              </Link>
            ) : null}
            {data.canCreateDocument ? (
              <Link
                href="/technical/studio"
                className="tap inline-flex items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-sidebar transition-colors hover:bg-white/90"
              >
                <FilePlus2 className="size-4" aria-hidden="true" />
                Generate document
              </Link>
            ) : null}
          </>
        }
      />

      <QuickActions>
        <QuickAction
          href="/approvals"
          tone={data.awaitingApproval > 0 ? 'warn' : 'neutral'}
          icon={<Stamp className="size-4" aria-hidden="true" />}
          count={data.awaitingApproval}
        >
          Awaiting approval
        </QuickAction>
        <QuickAction
          href="/technical"
          tone={data.openWorkRequests > 0 ? 'brand' : 'neutral'}
          icon={<HardHat className="size-4" aria-hidden="true" />}
          count={data.openWorkRequests}
        >
          Site inbox
        </QuickAction>
        <QuickAction
          href="/compliance"
          tone={data.expiring.length > 0 ? 'risk' : 'ok'}
          icon={<ShieldCheck className="size-4" aria-hidden="true" />}
          count={data.expiring.length}
        >
          Compliance
        </QuickAction>
        <QuickAction href="/repository" icon={<FileText className="size-4" aria-hidden="true" />}>
          Repository
        </QuickAction>
        <QuickAction href="/analytics" icon={<ArrowRight className="size-4" aria-hidden="true" />}>
          Analytics
        </QuickAction>
      </QuickActions>

      {attention.length > 0 ? (
        <section className="space-y-3">
          <SectionHead
            label="Needs your attention"
            count={attention.length}
            href="/technical"
            linkLabel="Technical Office"
          />
          {attention.map((item) => (
            <AttentionItem key={item.href + item.title} {...item} />
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHead
          label="The work"
          description="What has been asked for, what is written, and what a Director has signed."
          href="/technical/documents"
          linkLabel="Full position"
        />
        <StatStrip>
          <Stat
            label="Site inbox"
            value={data.openWorkRequests}
            note="reports from engineers, not yet written up"
            icon={<HardHat className="size-4" aria-hidden="true" />}
            href="/technical"
            tone={data.openWorkRequests > 0 ? 'brand' : 'neutral'}
          />
          <Stat
            label="Drafts"
            value={data.drafts}
            note="being written, no reference issued yet"
            icon={<FileText className="size-4" aria-hidden="true" />}
            href="/technical/documents"
          />
          <Stat
            label="With the Director"
            value={data.awaitingApproval}
            note="submitted and numbered, waiting on a decision"
            icon={<Stamp className="size-4" aria-hidden="true" />}
            href="/approvals"
            tone={data.awaitingApproval > 0 ? 'warn' : 'neutral'}
          />
          <Stat
            label="Issued"
            value={data.documentsIssued}
            note={`across ${data.activeProjects} active project${data.activeProjects === 1 ? '' : 's'}`}
            icon={<FileText className="size-4" aria-hidden="true" />}
            href="/repository"
          />
          <Stat
            label="Approved value"
            prefix="TZS"
            value={formatAmount(Decimal.from(data.approvedValue), 0)}
            chip={<StatChip label="This month">{data.approvedThisMonth}</StatChip>}
            note="quotations and invoices a Director has signed"
            icon={<ShieldCheck className="size-4" aria-hidden="true" />}
            href="/technical/documents"
            tone="ok"
          />
        </StatStrip>
      </section>

      <section className="space-y-3">
        <SectionBar
          label="Who the work is for"
          scope="By approved value · quotations and invoices a Director has signed"
          tone="ok"
          action={
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
            >
              Analytics
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        />

        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <Panel>
            <PanelHeader
              title="Clients by approved value"
              description="Largest first. Ranked against each other, not against a total."
            />
            <div className="p-4 sm:p-5">
              {data.topClients.length === 0 ? (
                <p className="text-sm text-ink-500">
                  Nothing has been approved yet, so there is no value to rank.
                </p>
              ) : (
                <RankedList
                  tone="ok"
                  items={data.topClients.map((c) => ({
                    label: c.name,
                    sub: `${c.documents} document${c.documents === 1 ? '' : 's'}`,
                    value: `TZS ${formatAmount(Decimal.from(c.value), 0)}`,
                    amount: Number(c.value),
                    href: '/technical/clients',
                  }))}
                />
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="What the office produces"
              description="Every document ever started, by type."
            />
            <div className="p-4 sm:p-5">
              {data.byType.length === 0 ? (
                <p className="text-sm text-ink-500">Nothing has been produced yet.</p>
              ) : (
                <SplitBar
                  total={data.byType.reduce((n, t) => n + t.count, 0)}
                  totalLabel="documents in total"
                  segments={data.byType.slice(0, 5).map((t, i) => ({
                    label: DOCUMENT_TYPE_LABELS[t.documentType] ?? t.documentType,
                    value: t.count,
                    tone: (['brand', 'ok', 'live', 'warn', 'risk'] as const)[i]!,
                  }))}
                />
              )}
            </div>
          </Panel>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead label="The desks" description="Where each part of the work actually lives." />
        <DeskGrid>
          <Desk
            href="/technical"
            title="Technical Office"
            description="Site reports in, drafts on the desk, and what has gone up for a decision."
            status={
              data.openWorkRequests > 0 ? `${data.openWorkRequests} waiting` : 'nothing waiting'
            }
          />
          <Desk
            href="/technical/studio"
            title="AI Document Studio"
            description="Turn a site report into the wording of a quotation, invoice or letter."
          />
          <Desk
            href="/approvals"
            title="Director Portal"
            description="Read in full, then approve and seal, or return for correction."
            status={
              data.awaitingApproval > 0 ? `${data.awaitingApproval} waiting` : 'nothing waiting'
            }
          />
          <Desk
            href="/technical/clients"
            title="Clients"
            description="Who they are, their TIN and VRN, and their purchase orders."
          />
          <Desk
            href="/compliance"
            title="Compliance"
            description="Every certificate, who issued it, and when it lapses."
            status={data.expiring.length > 0 ? `${data.expiring.length} expiring` : 'all valid'}
          />
          <Desk
            href="/repository"
            title="Repository"
            description="Every document ever issued, searchable by reference or client."
          />
        </DeskGrid>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader
            title="Recent documents"
            description="Newest first, whatever their state."
            action={
              <Link
                href="/repository"
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                All documents
              </Link>
            }
          />
          {data.recentDocuments.length === 0 ? (
            <EmptyState
              title="Nothing produced yet"
              description="Start one in the AI Document Studio, or accept a site visit and draft a quotation from it."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.recentDocuments.map((d) => {
                const status = DOCUMENT_STATUS[d.status] ?? {
                  label: d.status,
                  tone: 'neutral' as const,
                }
                return (
                  <li key={d.id}>
                    <Link
                      href={`/technical/documents/${d.id}`}
                      className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-ink-50 sm:px-5"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-400">
                        <FileText className="size-4" aria-hidden="true" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-900">
                          {d.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-500">
                          {d.reference ?? 'Not yet numbered'} · {d.clientName} ·{' '}
                          {DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType}
                        </span>
                      </span>

                      <span className="hidden shrink-0 text-right sm:block">
                        {d.grandTotal ? (
                          <span className="block text-sm font-medium text-ink-900 tabular">
                            {d.currency} {formatAmount(Decimal.from(d.grandTotal), 0)}
                          </span>
                        ) : null}
                        <span className="block text-xs text-ink-400">
                          {relativeTime(d.updatedAt)}
                        </span>
                      </span>

                      <Badge tone={status.tone}>{status.label}</Badge>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Latest site submissions"
            description="Waiting on the Technical Office."
            action={
              <Link
                href="/technical"
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                Queue
              </Link>
            }
          />
          {data.latestSubmissions.length === 0 ? (
            <EmptyState
              title="The queue is empty"
              description="Nothing is waiting to be reviewed."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.latestSubmissions.map((s) => {
                const urgency = URGENCY[s.urgency as Urgency]
                const status = SUBMISSION_STATUS[s.status as SubmissionStatus]
                return (
                  <li key={s.id}>
                    <Link
                      href={`/technical/submissions/${s.id}`}
                      className="block px-4 py-3.5 transition-colors hover:bg-ink-50 sm:px-5"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="flex-1 truncate text-sm font-medium text-ink-900">
                          {s.clientName}
                        </span>
                        <Badge tone={urgency.tone}>{urgency.label}</Badge>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-ink-500">
                        {s.problem}
                      </span>
                      <span className="mt-1.5 block text-xs text-ink-400">
                        {s.engineerName} · {status.label} · {relativeTime(s.submittedAt)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
