import Link from 'next/link'
import type { Metadata } from 'next'
import { desc, eq } from 'drizzle-orm'
import { clients, deliveries, projects } from '@/db/schema'
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  RecordCard,
  RecordGrid,
  SectionBar,
} from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { DELIVERY_STATUS, formatDate } from '@/lib/display'

export const metadata: Metadata = { title: 'Deliveries' }

export default async function DeliveriesPage() {
  const rows = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'delivery.sign')) {
      throw new AuthorizationError('Deliveries are recorded by the Technical Office and Engineers.')
    }

    return db
      .select({
        id: deliveries.id,
        deliveryDate: deliveries.deliveryDate,
        status: deliveries.status,
        location: deliveries.location,
        handoverPersonName: deliveries.handoverPersonName,
        receiverName: deliveries.receiverName,
        handoverSignatureKey: deliveries.handoverSignatureKey,
        receiverSignatureKey: deliveries.receiverSignatureKey,
        clientName: clients.legalName,
        projectName: projects.name,
      })
      .from(deliveries)
      .innerJoin(clients, eq(clients.id, deliveries.clientId))
      .innerJoin(projects, eq(projects.id, deliveries.projectId))
      .orderBy(desc(deliveries.deliveryDate))
      .limit(200)
  })

  const awaiting = rows.filter((r) => r.status === 'pending_signatures' || r.status === 'draft')
  const settled = rows.filter((r) => r.status === 'confirmed' || r.status === 'cancelled')

  return (
    <>
      <PageHeader
        eyebrow="Technical Office"
        title="Deliveries"
        description={
          awaiting.length === 0
            ? 'Nothing waiting for signatures.'
            : `${awaiting.length} awaiting signatures.`
        }
        stats={[
          { label: 'delivery notes', value: rows.length },
          { label: 'awaiting signature', value: awaiting.length },
          { label: 'settled', value: settled.length },
        ]}
      />

      <SectionBar
        label="What has left the yard"
        scope="A signed delivery note is what lets an invoice be raised against the work"
        tone={awaiting.length > 0 ? 'warn' : 'ok'}
      />

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="No deliveries recorded"
            description="Deliveries are recorded from a project. Open the project and use the Deliveries tab."
          />
        </Panel>
      ) : null}

      {awaiting.length > 0 ? <Group title="Awaiting signatures" rows={awaiting} /> : null}
      {settled.length > 0 ? <Group title="Settled" rows={settled} muted /> : null}
    </>
  )
}

type Row = {
  id: string
  deliveryDate: string
  status: string
  location: string | null
  handoverPersonName: string
  receiverName: string | null
  handoverSignatureKey: string | null
  receiverSignatureKey: string | null
  clientName: string
  projectName: string
}

function Group({ title, rows, muted }: { title: string; rows: Row[]; muted?: boolean }) {
  const scope: Record<string, string> = {
    'Awaiting signatures':
      'Both signatures are needed. Until then no invoice can be raised against this work.',
    Settled: 'Signed by both sides, or cancelled. Kept either way — a delivery note is evidence.',
  }

  return (
    <section className="space-y-3">
      <SectionBar
        label={title}
        scope={scope[title]}
        tone={title.startsWith('Awaiting') ? 'warn' : 'ok'}
      />
      <div className={muted ? 'opacity-70' : undefined}>
        <RecordGrid>
          {rows.map((row, i) => {
            const status = DELIVERY_STATUS[row.status] ?? {
              label: row.status,
              tone: 'neutral' as const,
            }
            const both = Boolean(row.handoverSignatureKey && row.receiverSignatureKey)
            return (
              <RecordCard
                key={row.id}
                index={i}
                href={`/technical/deliveries/${row.id}`}
                accent={both ? 'ok' : row.status === 'cancelled' ? undefined : 'warn'}
                chips={
                  <>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <span className="text-xs text-ink-500">{formatDate(row.deliveryDate)}</span>
                  </>
                }
                title={row.clientName}
                meta={`${row.projectName}${row.location ? ` · ${row.location}` : ''}`}
                note={
                  /* Which side has signed. Two ticks is what releases an invoice,
                     so it is stated rather than left to be inferred. */
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <span
                      className={row.handoverSignatureKey ? 'text-ok-700' : 'text-ink-400'}
                    >
                      {row.handoverSignatureKey ? '✓' : '○'} HA GROUP signed
                    </span>
                    <span
                      className={row.receiverSignatureKey ? 'text-ok-700' : 'text-ink-400'}
                    >
                      {row.receiverSignatureKey ? '✓' : '○'} client signed
                    </span>
                  </p>
                }
                footer={both ? 'Complete — an invoice may be raised' : 'Not yet fully signed'}
              />
            )
          })}
        </RecordGrid>
      </div>
    </section>
  )
}
