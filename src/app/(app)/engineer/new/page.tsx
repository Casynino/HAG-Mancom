import Link from 'next/link'
import type { Metadata } from 'next'
import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import { clients, projectMembers, projects } from '@/db/schema'
import { PageHeader } from '@/components/ui'
import { SubmissionForm } from '@/components/submission-form'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'

export const metadata: Metadata = { title: 'New site submission' }

export default async function NewSubmissionPage() {
  const options = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'submission.create')) {
      throw new AuthorizationError('Only Engineers can file site submissions.')
    }

    // Assigned, open projects only. RLS would hide the rest anyway; joining
    // through project_members makes the intent explicit and keeps the list short.
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        reference: projects.reference,
        clientName: clients.legalName,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projects.id, projectMembers.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(
        and(
          eq(projectMembers.userId, actor.id),
          isNull(projectMembers.removedAt),
          ne(projects.status, 'archived'),
          ne(projects.status, 'completed'),
        ),
      )
      .orderBy(asc(clients.legalName), asc(projects.name))

    return rows
  })

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/engineer" className="hover:underline">
            ← My site work
          </Link>
        }
        title="New site submission"
        description="Record what you found. It takes a minute — photos and measurements do most of the work."
      />

      <SubmissionForm projects={options} />
    </>
  )
}
