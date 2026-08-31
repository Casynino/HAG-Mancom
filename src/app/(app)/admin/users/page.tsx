import type { Metadata } from 'next'
import { asc, isNull } from 'drizzle-orm'
import { profiles, userRoles } from '@/db/schema'
import { UserManager } from '@/components/user-manager'
import { PageHeader } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission, type AppRole } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'

export const metadata: Metadata = { title: 'People and roles' }

export default async function UsersPage() {
  const { people, actorId } = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'user.manage')) {
      throw new AuthorizationError('People and roles are managed by Administrators.')
    }

    const [rows, grants] = await Promise.all([
      db
        .select({
          id: profiles.id,
          email: profiles.email,
          fullName: profiles.fullName,
          jobTitle: profiles.jobTitle,
          phone: profiles.phone,
          isActive: profiles.isActive,
          mustChangePassword: profiles.mustChangePassword,
          lastLoginAt: profiles.lastLoginAt,
          lockedUntil: profiles.lockedUntil,
        })
        .from(profiles)
        .orderBy(asc(profiles.isActive), asc(profiles.fullName))
        .limit(300),

      // Fetched as a separate list and grouped in JS rather than as a
      // correlated array subquery: simpler to read, and it avoids relying on
      // how the driver parses a custom enum array type.
      db
        .select({ userId: userRoles.userId, role: userRoles.role })
        .from(userRoles)
        .where(isNull(userRoles.revokedAt)),
    ])

    const rolesByUser = new Map<string, AppRole[]>()
    for (const g of grants) {
      const list = rolesByUser.get(g.userId) ?? []
      list.push(g.role)
      rolesByUser.set(g.userId, list)
    }

    return {
      people: rows.map((r) => ({
        ...r,
        roles: (rolesByUser.get(r.id) ?? []).sort(),
      })),
      actorId: actor.id,
    }
  })

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="People and roles"
        description="Roles decide what each person can reach. Every grant and revoke is recorded in the audit trail."
      />
      <UserManager people={people} actorId={actorId} />
    </>
  )
}
