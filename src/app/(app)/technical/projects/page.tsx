import type { Metadata } from 'next'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { clients, profiles, projectMembers, projects, userRoles } from '@/db/schema'
import { ProjectManager } from '@/components/project-manager'
import { PageHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'

export const metadata: Metadata = { title: 'Projects' }

export default async function ProjectsPage() {
  const data = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'project.view_all')) {
      throw new AuthorizationError('Projects are managed by the Technical Office.')
    }

    const [projectRows, clientRows, engineerRows, memberRows] = await Promise.all([
      db
        .select({
          id: projects.id,
          name: projects.name,
          reference: projects.reference,
          location: projects.location,
          status: projects.status,
          clientId: projects.clientId,
          clientName: clients.legalName,
          submissionCount: sql<number>`(
            select count(*)::int from engineer_submissions es where es.project_id = ${projects.id}
          )`,
        })
        .from(projects)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .orderBy(asc(projects.status), asc(clients.legalName), asc(projects.name))
        .limit(300),

      db
        .select({ id: clients.id, legalName: clients.legalName })
        .from(clients)
        .where(eq(clients.status, 'active'))
        .orderBy(asc(clients.legalName)),

      // Anyone who can be assigned to site work.
      db
        .selectDistinct({ id: profiles.id, fullName: profiles.fullName })
        .from(profiles)
        .innerJoin(userRoles, eq(userRoles.userId, profiles.id))
        .where(
          and(
            eq(profiles.isActive, true),
            isNull(userRoles.revokedAt),
            inArray(userRoles.role, ['engineer', 'technical_officer']),
          ),
        )
        .orderBy(asc(profiles.fullName)),

      db
        .select({
          id: projectMembers.id,
          projectId: projectMembers.projectId,
          userId: projectMembers.userId,
          isLead: projectMembers.isLead,
          roleOnProject: projectMembers.roleOnProject,
          fullName: profiles.fullName,
        })
        .from(projectMembers)
        .innerJoin(profiles, eq(profiles.id, projectMembers.userId))
        .where(isNull(projectMembers.removedAt))
        .orderBy(asc(profiles.fullName)),
    ])

    return {
      projects: projectRows,
      clients: clientRows,
      engineers: engineerRows,
      members: memberRows,
      canAssign: hasPermission(actor.roles, 'project.assign_members'),
      canCreate: hasPermission(actor.roles, 'project.manage'),
    }
  })

  return (
    <>
      <PageHeader
        eyebrow="Technical Office"
        title="Projects"
        description="A project is the workspace for a client engagement. Assigning an Engineer is what lets them file from site."
      />
      <ProjectManager {...data} />
    </>
  )
}
