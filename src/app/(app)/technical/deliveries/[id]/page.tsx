import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { asc, eq } from 'drizzle-orm'
import {
  clientPurchaseOrders,
  clients,
  deliveries,
  deliveryItems,
  deliveryPhotos,
  projects,
} from '@/db/schema'
import { DeliverySigning } from '@/components/delivery-signing'
import { Badge, DescriptionList, Notice, PageHeader, Panel, PanelHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { DELIVERY_STATUS, formatDate, formatDateTime } from '@/lib/display'

export const metadata: Metadata = { title: 'Delivery' }

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'delivery.sign')) {
      throw new AuthorizationError('Deliveries are recorded by the Technical Office and Engineers.')
    }

    const [row] = await db
      .select({
        delivery: deliveries,
        clientName: clients.legalName,
        projectName: projects.name,
        projectId: projects.id,
      })
      .from(deliveries)
      .innerJoin(clients, eq(clients.id, deliveries.clientId))
      .innerJoin(projects, eq(projects.id, deliveries.projectId))
      .where(eq(deliveries.id, id))
      .limit(1)

    if (!row) return null

    const [items, photos, po] = await Promise.all([
      db
        .select()
        .from(deliveryItems)
        .where(eq(deliveryItems.deliveryId, id))
        .orderBy(asc(deliveryItems.position)),
      db
        .select()
        .from(deliveryPhotos)
        .where(eq(deliveryPhotos.deliveryId, id))
        .orderBy(asc(deliveryPhotos.uploadedAt)),
      row.delivery.clientPurchaseOrderId
        ? db
            .select()
            .from(clientPurchaseOrders)
            .where(eq(clientPurchaseOrders.id, row.delivery.clientPurchaseOrderId))
            .limit(1)
        : Promise.resolve([]),
    ])

    return { ...row, items, photos, po: po[0] ?? null }
  })

  if (!data) notFound()

  const d = data.delivery
  const status = DELIVERY_STATUS[d.status] ?? {
    label: d.status,
    tone: 'neutral' as const,
  }

  return (
    <>
      <PageHeader
        back={{ href: `/technical/projects/${data.projectId}`, label: data.projectName }}
        eyebrow="Technical Office"
        tone="brand"
        title={`Delivery — ${formatDate(d.deliveryDate)}`}
        description={`${data.clientName}${d.location ? ` · ${d.location}` : ''}`}
        action={<Badge tone={status.tone}>{status.label}</Badge>}
      />

      {d.status === 'confirmed' ? (
        <Notice tone="ok" title="Confirmed">
          Both sides have signed. This delivery unlocks invoicing for the project.
        </Notice>
      ) : (
        <Notice tone="warn" title="Not yet confirmed">
          Both HA GROUP and the client must sign before this delivery can support a tax invoice.
        </Notice>
      )}

      <Panel>
        <PanelHeader title="Details" />
        <div className="px-4 sm:px-5">
          <DescriptionList
            items={[
              ['Delivered by', d.handoverPersonName],
              [
                'Received by',
                d.receiverName
                  ? `${d.receiverName}${d.receiverTitle ? `, ${d.receiverTitle}` : ''}`
                  : 'Not recorded',
              ],
              ['Client Purchase Order', data.po ? data.po.poNumber : 'Not against a specific PO'],
              ['Location', d.location ?? '—'],
              ['Confirmed', d.confirmedAt ? formatDateTime(d.confirmedAt) : 'Not yet'],
              ['Notes', d.notes ?? '—'],
            ]}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Delivered items" />
        {data.items.length === 0 ? (
          <p className="px-4 py-5 text-sm text-ink-500 sm:px-5">Nothing listed.</p>
        ) : (
          <ul className="divide-y divide-ink-100 px-4 sm:px-5">
            {data.items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="text-sm text-ink-800">{item.description}</span>
                <span className="text-sm font-medium text-ink-900 tabular">
                  {item.quantity} {item.unit ?? ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <DeliverySigning
        deliveryId={d.id}
        status={d.status}
        handoverPersonName={d.handoverPersonName}
        receiverName={d.receiverName}
        hasHandoverSignature={Boolean(d.handoverSignatureKey)}
        hasReceiverSignature={Boolean(d.receiverSignatureKey)}
        handoverSignedAt={d.handoverSignedAt?.toISOString() ?? null}
        receiverSignedAt={d.receiverSignedAt?.toISOString() ?? null}
        photos={data.photos.map((p) => ({
          id: p.id,
          filename: p.originalFilename,
          caption: p.caption,
        }))}
      />
    </>
  )
}
