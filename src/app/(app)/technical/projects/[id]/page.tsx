import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import {
  clientContacts,
  clientPurchaseOrders,
  clients,
  completionRecords,
  deliveries,
  documents,
  engineerSubmissions,
  profiles,
  projectMembers,
  projects,
} from '@/db/schema'
import { ProjectWorkspace } from '@/components/project-workspace'
import { Badge, PageHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'

export const metadata: Metadata = { title: 'Project' }

/**
 * The project workspace.
 *
 * Everything that belongs to one client engagement in one place: the team, the
 * client's contacts, their Purchase Orders, site submissions, documents,
 * deliveries and completion evidence. It is where a Technical Officer records
 * the PO the client sent and the evidence that unlocks invoicing.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'project.view_all')) {
      throw new AuthorizationError('Projects are managed by the Technical Office.')
    }

    const [row] = await db
      .select({ project: projects, client: clients })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(eq(projects.id, id))
      .limit(1)

    if (!row) return null

    const [
      members,
      contacts,
      purchaseOrders,
      submissions,
      docs,
      deliveryRows,
      completions,
      engineers,
    ] = await Promise.all([
      db
        .select({
          id: projectMembers.id,
          userId: projectMembers.userId,
          isLead: projectMembers.isLead,
          fullName: profiles.fullName,
        })
        .from(projectMembers)
        .innerJoin(profiles, eq(profiles.id, projectMembers.userId))
        .where(and(eq(projectMembers.projectId, id), isNull(projectMembers.removedAt))),

      db
        .select()
        .from(clientContacts)
        .where(and(eq(clientContacts.clientId, row.client.id), isNull(clientContacts.archivedAt)))
        .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.fullName)),

      db
        .select()
        .from(clientPurchaseOrders)
        .where(eq(clientPurchaseOrders.projectId, id))
        .orderBy(desc(clientPurchaseOrders.createdAt)),

      db
        .select({
          id: engineerSubmissions.id,
          reference: engineerSubmissions.reference,
          title: engineerSubmissions.title,
          status: engineerSubmissions.status,
          urgency: engineerSubmissions.urgency,
          submittedAt: engineerSubmissions.submittedAt,
          authorName: profiles.fullName,
        })
        .from(engineerSubmissions)
        .innerJoin(profiles, eq(profiles.id, engineerSubmissions.submittedBy))
        .where(eq(engineerSubmissions.projectId, id))
        .orderBy(desc(engineerSubmissions.updatedAt)),

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
        })
        .from(documents)
        .where(eq(documents.projectId, id))
        .orderBy(desc(documents.updatedAt)),

      db
        .select()
        .from(deliveries)
        .where(eq(deliveries.projectId, id))
        .orderBy(desc(deliveries.deliveryDate)),

      db
        .select({
          record: completionRecords,
          verifierName: profiles.fullName,
        })
        .from(completionRecords)
        .leftJoin(profiles, eq(profiles.id, completionRecords.verifiedBy))
        .where(eq(completionRecords.projectId, id))
        .orderBy(desc(completionRecords.completedOn)),

      db
        .select({ id: profiles.id, fullName: profiles.fullName })
        .from(profiles)
        .where(eq(profiles.isActive, true))
        .orderBy(asc(profiles.fullName)),
    ])

    return {
      project: row.project,
      client: row.client,
      members,
      contacts,
      purchaseOrders,
      submissions,
      documents: docs,
      deliveries: deliveryRows,
      completions,
      engineers,
      canManagePo: hasPermission(actor.roles, 'po.manage'),
      canManageDelivery: hasPermission(actor.roles, 'delivery.manage'),
      canManageCompletion: hasPermission(actor.roles, 'completion.manage'),
      canManageClient: hasPermission(actor.roles, 'client.manage'),
    }
  })

  if (!data) notFound()

  // The gate an invoice has to pass, shown plainly rather than discovered later.
  const hasConfirmedDelivery = data.deliveries.some((d) => d.status === 'confirmed')
  const hasVerifiedCompletion = data.completions.some((c) => c.record.verifiedAt !== null)

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/technical/projects" className="hover:underline">
            ← Projects
          </Link>
        }
        title={data.project.name}
        description={`${data.client.legalName} · ${data.project.reference}`}
        action={
          <Badge tone={data.project.status === 'active' ? 'brand' : 'neutral'}>
            {data.project.status.replace(/_/g, ' ')}
          </Badge>
        }
      />

      <ProjectWorkspace
        projectId={data.project.id}
        clientId={data.client.id}
        clientName={data.client.legalName}
        members={data.members}
        contacts={data.contacts.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          jobTitle: c.jobTitle,
          phone: c.phone,
          email: c.email,
          isPrimary: c.isPrimary,
          receivesDocuments: c.receivesDocuments,
        }))}
        purchaseOrders={data.purchaseOrders.map((p) => ({
          id: p.id,
          poNumber: p.poNumber,
          poDate: p.poDate,
          status: p.status,
          currency: p.currency,
          orderValue: p.orderValue,
          description: p.description,
          hasDocument: Boolean(p.documentStorageKey),
        }))}
        submissions={data.submissions.map((s) => ({
          ...s,
          submittedAt: s.submittedAt?.toISOString() ?? null,
        }))}
        documents={data.documents.map((d) => ({
          ...d,
          updatedAt: d.updatedAt.toISOString(),
        }))}
        deliveries={data.deliveries.map((d) => ({
          id: d.id,
          deliveryDate: d.deliveryDate,
          status: d.status,
          location: d.location,
          handoverPersonName: d.handoverPersonName,
          receiverName: d.receiverName,
          hasHandoverSignature: Boolean(d.handoverSignatureKey),
          hasReceiverSignature: Boolean(d.receiverSignatureKey),
        }))}
        completions={data.completions.map((c) => ({
          id: c.record.id,
          source: c.record.source,
          completedOn: c.record.completedOn,
          acceptedByName: c.record.acceptedByName,
          verifiedAt: c.record.verifiedAt?.toISOString() ?? null,
          verifierName: c.verifierName,
          hasEvidence: Boolean(c.record.evidenceStorageKey),
        }))}
        engineers={data.engineers}
        invoiceReady={hasConfirmedDelivery || hasVerifiedCompletion}
        canManagePo={data.canManagePo}
        canManageDelivery={data.canManageDelivery}
        canManageCompletion={data.canManageCompletion}
        canManageClient={data.canManageClient}
      />
    </>
  )
}
