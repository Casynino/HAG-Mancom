import Link from 'next/link'
import type { Metadata } from 'next'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { clients, engineerSubmissions, projectMembers, projects } from '@/db/schema'
import {
  AttentionItem,
  Badge,
  BannerPill,
  Desk,
  DeskGrid,
  EmptyState,
  MetricCard,
  Panel,
  QuickAction,
  QuickActions,
  RecordCard,
  RecordGrid,
  SectionBar,
  WelcomeBanner,
} from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import type { ReactNode } from 'react'
import { ClipboardList, FileSearch, HardHat, Layers, Send, Truck, UserCog } from 'lucide-react'
import { formatDate } from '@/lib/display'
import {
  relativeTime,
  SUBMISSION_STATUS,
  URGENCY,
  type SubmissionStatus,
  type Urgency,
} from '@/lib/display'

export const metadata: Metadata = { title: 'My site work' }

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default async function EngineerHome() {
  const { rows, canCreate, myProjects, actorName } = await pageContext(async (db, actor) => {
    const result = await db
      .select({
        id: engineerSubmissions.id,
        reference: engineerSubmissions.reference,
        title: engineerSubmissions.title,
        status: engineerSubmissions.status,
        urgency: engineerSubmissions.urgency,
        updatedAt: engineerSubmissions.updatedAt,
        submittedAt: engineerSubmissions.submittedAt,
        correctionComment: engineerSubmissions.correctionComment,
        projectName: projects.name,
        clientName: clients.legalName,
      })
      .from(engineerSubmissions)
      .innerJoin(projects, eq(projects.id, engineerSubmissions.projectId))
      .innerJoin(clients, eq(clients.id, engineerSubmissions.clientId))
      .where(eq(engineerSubmissions.submittedBy, actor.id))
      .orderBy(desc(engineerSubmissions.updatedAt))
      .limit(100)

    /*
     * The sites this Engineer is assigned to. Being a project member is what
     * lets them file from site at all, so a Home that does not show it leaves
     * them guessing why a project is missing from the submission form.
     */
    const assigned = await db
      .select({
        id: projects.id,
        name: projects.name,
        reference: projects.reference,
        location: projects.location,
        clientName: clients.legalName,
        submissions: sql<number>`(
          select count(*)::int from public.engineer_submissions es
           where es.project_id = ${projects.id} and es.submitted_by = ${actor.id}
        )`,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(and(eq(projectMembers.userId, actor.id), isNull(projects.archivedAt)))
      .orderBy(projects.name)
      .limit(8)

    return {
      rows: result,
      myProjects: assigned,
      actorName: actor.fullName,
      canCreate: hasPermission(actor.roles, 'submission.create'),
    }
  })

  const needsAttention = rows.filter(
    (r) => r.status === 'changes_requested' || r.status === 'draft',
  )
  const inProgress = rows.filter((r) => r.status === 'submitted' || r.status === 'under_review')
  const closed = rows.filter((r) =>
    ['accepted', 'ready_for_documentation', 'cancelled'].includes(r.status),
  )

  const now = new Date()
  const urgent = rows.filter((r) => r.urgency === 'high' || r.urgency === 'critical').length
  const written = rows.filter((r) =>
    ['accepted', 'ready_for_documentation'].includes(r.status),
  ).length

  /*
   * What is genuinely waiting on this Engineer. Drafts and returned reports are
   * the only two things that stop dead without them; everything else is moving
   * and needs nothing.
   */
  const attention: Array<{
    href: string
    title: string
    line: string
    tone: 'warn' | 'risk' | 'brand'
    icon: ReactNode
  }> = []

  const returned = rows.filter((r) => r.status === 'changes_requested')
  const drafts = rows.filter((r) => r.status === 'draft')

  if (returned.length > 0) {
    attention.push({
      href: `/engineer/submissions/${returned[0]!.id}`,
      title: `${returned.length} report${returned.length === 1 ? '' : 's'} sent back to you`,
      line:
        returned[0]!.correctionComment ??
        'The Technical Office needs something changed before this can move.',
      tone: 'warn',
      icon: <Send className="size-4" aria-hidden="true" />,
    })
  }
  if (drafts.length > 0) {
    attention.push({
      href: `/engineer/submissions/${drafts[0]!.id}`,
      title: `${drafts.length} draft${drafts.length === 1 ? '' : 's'} not yet sent`,
      line: 'Nobody can see a draft but you. It reaches the Technical Office when you submit it.',
      tone: 'brand',
      icon: <ClipboardList className="size-4" aria-hidden="true" />,
    })
  }

  return (
    <>
      <WelcomeBanner
        greeting={greeting(now.getHours())}
        name={actorName.split(' ').slice(-1)[0] ?? actorName}
        line="What you have filed from site, and anything waiting on you."
        pills={
          <>
            <BannerPill dot>{formatDate(now.toISOString().slice(0, 10))}</BannerPill>
            <BannerPill>ENGINEER</BannerPill>
          </>
        }
        actions={
          canCreate ? (
            <Link
              href="/engineer/new"
              className="tap inline-flex items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-sidebar transition-colors hover:bg-white/90"
            >
              <HardHat className="size-4" aria-hidden="true" />
              New site submission
            </Link>
          ) : null
        }
      />

      <QuickActions>
        {canCreate ? (
          <QuickAction
            href="/engineer/new"
            tone="brand"
            icon={<HardHat className="size-4" aria-hidden="true" />}
          >
            Report from site
          </QuickAction>
        ) : null}
        <QuickAction
          href="/technical/deliveries"
          icon={<Truck className="size-4" aria-hidden="true" />}
        >
          Deliveries
        </QuickAction>
        <QuickAction href="/repository" icon={<FileSearch className="size-4" aria-hidden="true" />}>
          Repository
        </QuickAction>
        <QuickAction href="/profile" icon={<UserCog className="size-4" aria-hidden="true" />}>
          My profile
        </QuickAction>
      </QuickActions>

      {attention.length > 0 ? (
        <section className="space-y-3">
          <SectionBar
            label="Needs your attention"
            scope="Nothing else on this page is waiting on you"
            tone="warn"
          />
          {attention.map((item) => (
            <AttentionItem key={item.href + item.title} {...item} />
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionBar
          label="Your work"
          scope="Everything you have filed, all time · nobody else's reports are counted here"
          tone="brand"
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            index={0}
            label="Filed"
            value={rows.length}
            note="every report you have made, all time"
            icon={<ClipboardList className="size-4" aria-hidden="true" />}
            tone="brand"
          />
          <MetricCard
            index={1}
            label="With the office"
            value={inProgress.length}
            note="submitted, waiting to be read"
            icon={<Send className="size-4" aria-hidden="true" />}
            tone={inProgress.length > 0 ? 'live' : 'neutral'}
          />
          <MetricCard
            index={2}
            label="Written up"
            value={written}
            note="accepted and turned into a document"
            icon={<FileSearch className="size-4" aria-hidden="true" />}
            tone="ok"
          />
          <MetricCard
            index={3}
            label="Reported urgent"
            value={urgent}
            note="you marked these high or critical"
            icon={<HardHat className="size-4" aria-hidden="true" />}
            tone={urgent > 0 ? 'risk' : 'neutral'}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionBar
          label="Your sites"
          scope="Being assigned to a project is what lets you file against it"
          tone="ok"
        />
        {myProjects.length === 0 ? (
          <Panel>
            <EmptyState
              title="You are not on a project yet"
              description="A Technical Officer assigns Engineers to a project. Until then there is nothing to file against — ask them to add you."
              icon={<Layers className="size-5" aria-hidden="true" />}
            />
          </Panel>
        ) : (
          <DeskGrid>
            {myProjects.map((p) => (
              <Desk
                key={p.id}
                href={`/technical/projects/${p.id}`}
                title={p.name}
                description={`${p.clientName}${p.location ? ` · ${p.location}` : ''}`}
                status={p.submissions > 0 ? `${p.submissions} filed by you` : 'nothing filed yet'}
              />
            ))}
          </DeskGrid>
        )}
      </section>

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nothing filed yet"
            description="When you visit a site, record what you found here. It takes a minute and goes straight to the Technical Officer."
            action={
              canCreate ? (
                <Link
                  href="/engineer/new"
                  className="tap btn-primary inline-flex items-center rounded-lg px-4 text-sm font-medium text-white"
                >
                  Start a submission
                </Link>
              ) : null
            }
          />
        </Panel>
      ) : null}

      {needsAttention.length > 0 ? (
        <Section title="Needs you" rows={needsAttention} highlight />
      ) : null}
      {inProgress.length > 0 ? (
        <Section title="With the Technical Office" rows={inProgress} />
      ) : null}
      {closed.length > 0 ? <Section title="Closed" rows={closed} /> : null}
    </>
  )
}

type Row = {
  id: string
  reference: string | null
  title: string
  status: string
  urgency: string
  updatedAt: Date
  submittedAt: Date | null
  correctionComment: string | null
  projectName: string
  clientName: string
}

function Section({ title, rows, highlight }: { title: string; rows: Row[]; highlight?: boolean }) {
  return (
    <section className="space-y-3">
      <SectionBar
        label={title}
        scope={
          highlight
            ? 'These need something from you before they can move'
            : 'Your own site reports · nobody else can see them'
        }
        tone={highlight ? 'warn' : 'brand'}
      />
      <RecordGrid>
        {rows.map((row, i) => {
          const status = SUBMISSION_STATUS[row.status as SubmissionStatus]
          const urgency = URGENCY[row.urgency as Urgency]
          const urgent = row.urgency !== 'normal' && row.urgency !== 'low'

          return (
            <RecordCard
              key={row.id}
              index={i}
              href={`/engineer/submissions/${row.id}`}
              accent={highlight ? 'warn' : urgent ? 'risk' : undefined}
              reference={row.reference}
              chips={
                <>
                  <Badge tone={status.tone}>{status.engineerLabel}</Badge>
                  {urgent ? <Badge tone={urgency.tone}>{urgency.label}</Badge> : null}
                </>
              }
              title={row.title}
              meta={`${row.clientName} · ${row.projectName}`}
              note={
                highlight && row.correctionComment ? (
                  <p className="rounded-lg border border-warn-600/25 bg-warn-50 px-3 py-2 text-sm text-warn-700">
                    {row.correctionComment}
                  </p>
                ) : null
              }
              footer={
                row.submittedAt
                  ? `Submitted ${relativeTime(row.submittedAt)}`
                  : `Edited ${relativeTime(row.updatedAt)}`
              }
            />
          )
        })}
      </RecordGrid>
    </section>
  )
}
