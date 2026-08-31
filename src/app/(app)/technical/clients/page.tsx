import type { Metadata } from 'next'
import { asc, eq, sql } from 'drizzle-orm'
import { clients, projects } from '@/db/schema'
import { ClientManager } from '@/components/client-manager'
import { PageHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'

export const metadata: Metadata = { title: 'Clients' }

export default async function ClientsPage() {
  const rows = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'client.manage')) {
      throw new AuthorizationError('Client records are managed by the Technical Office.')
    }

    return db
      .select({
        id: clients.id,
        legalName: clients.legalName,
        tradingName: clients.tradingName,
        tin: clients.tin,
        vrn: clients.vrn,
        registrationNumber: clients.registrationNumber,
        addressLine1: clients.addressLine1,
        addressLine2: clients.addressLine2,
        city: clients.city,
        region: clients.region,
        postalAddress: clients.postalAddress,
        country: clients.country,
        contactPerson: clients.contactPerson,
        contactPhone: clients.contactPhone,
        contactEmail: clients.contactEmail,
        notes: clients.notes,
        status: clients.status,
        projectCount: sql<number>`(
          select count(*)::int from ${projects} where ${projects.clientId} = ${clients.id}
        )`,
      })
      .from(clients)
      .orderBy(asc(clients.status), asc(clients.legalName))
      .limit(300)
  })

  return (
    <>
      <PageHeader
        eyebrow="Technical Office"
        title="Clients"
        description="Client records feed every document. TIN and VRN print on tax invoices, so keep them current."
      />
      <ClientManager clients={rows} />
    </>
  )
}
