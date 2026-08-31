import type { Metadata } from 'next'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { clientPurchaseOrders, clients, engineerSubmissions, profiles, projects } from '@/db/schema'
import { DocumentStudio } from '@/components/document-studio'
import { PageHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { checkConfigReadiness } from '@/lib/finance/config'
import { isAiConfigured } from '@/lib/ai/provider'

export const metadata: Metadata = { title: 'AI Document Studio' }

/**
 * One place to produce a company document.
 *
 * The pieces already existed — creating a document, drafting scope from a site
 * visit, drafting letter prose — but they were scattered across the review
 * queue and the document editor, so producing a document meant knowing which
 * screen to start from. This is the single front door: choose the type, say who
 * it is for, and let the assistant draft the wording.
 *
 * What the assistant does and does not do is stated on the page rather than
 * left to be discovered. It writes prose. It never prices anything, never
 * allocates a reference, never approves and never signs — those are the
 * platform's own responsibilities and they are enforced in the database, not
 * merely withheld from the prompt.
 */
export default async function StudioPage() {
  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'document.create')) {
      throw new AuthorizationError('Documents are prepared by the Technical Office.')
    }

    const [projectRows, poRows, submissionRows, readiness] = await Promise.all([
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

      // Only visits that have been accepted: drafting a priced document from an
      // unreviewed site report would put un-checked findings in front of a client.
      db
        .select({
          id: engineerSubmissions.id,
          title: engineerSubmissions.title,
          projectId: engineerSubmissions.projectId,
          authorName: profiles.fullName,
        })
        .from(engineerSubmissions)
        .innerJoin(profiles, eq(profiles.id, engineerSubmissions.submittedBy))
        .where(inArray(engineerSubmissions.status, ['accepted', 'ready_for_documentation']))
        .orderBy(desc(engineerSubmissions.updatedAt))
        .limit(50),

      checkConfigReadiness(db, 'quotation', 'TZS'),
    ])

    return {
      projects: projectRows,
      purchaseOrders: poRows,
      submissions: submissionRows,
      readiness,
      aiAvailable: isAiConfigured(),
    }
  })

  return (
    <>
      <PageHeader
        eyebrow="AI Document Studio"
        title="Generate a company document"
        description="Answer a few questions. The assistant drafts the wording; the platform does every calculation, allocates the reference at approval, and applies the seal."
      />

      <DocumentStudio
        projects={data.projects}
        purchaseOrders={data.purchaseOrders}
        submissions={data.submissions}
        aiAvailable={data.aiAvailable}
        configReady={data.readiness.ready}
        configMissing={data.readiness.missing}
      />
    </>
  )
}
