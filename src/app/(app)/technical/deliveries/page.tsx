import Link from 'next/link'
import type { Metadata } from 'next'
import { desc, eq } from 'drizzle-orm'
import { clients, deliveries, projects } from '@/db/schema'
import { Badge, EmptyState, PageHeader, Panel } from '@/components/ui'
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
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold tracking-wider text-ink-500 uppercase">{title}</h2>
      <Panel className="divide-y divide-ink-100">
        {rows.map((row) => {
          const status = DELIVERY_STATUS[row.status] ?? {
            label: row.status,
            tone: 'neutral' as const,
          }
          return (
            <Link
              key={row.id}
              href={`/technical/deliveries/${row.id}`}
              className={`block px-4 py-3.5 hover:bg-ink-50 sm:px-5 ${muted ? 'opacity-70' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={status.tone}>{status.label}</Badge>
                <span className="text-sm text-ink-600">{formatDate(row.deliveryDate)}</span>
              </div>
              <p className="mt-1 font-medium text-ink-900">{row.clientName}</p>
              <p className="mt-0.5 text-sm text-ink-500">
                {row.projectName}
                {row.location ? ` · ${row.location}` : ''}
              </p>
              <p className="mt-1.5 text-xs text-ink-400">
                {row.handoverSignatureKey ? '✓' : '○'} HA GROUP ·{' '}
                {row.receiverSignatureKey ? '✓' : '○'} client
              </p>
            </Link>
          )
        })}
      </Panel>
    </section>
  )
}
