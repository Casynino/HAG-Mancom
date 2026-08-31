import type { Metadata } from 'next'

/** Nothing behind sign-in belongs in a search index. */
export const metadata: Metadata = { robots: { index: false, follow: false } }

import { and, eq, isNull, sql } from 'drizzle-orm'
import { notifications } from '@/db/schema'
import { AppNav, type NavItem } from '@/components/app-nav'
import { pageContext } from '@/lib/authz/guard'
import { defaultRouteFor, hasPermission, ROLE_LABELS } from '@/lib/authz/roles'

/**
 * Signed-in shell.
 *
 * Navigation is filtered by the permission matrix, so a role never sees a
 * section it cannot use. That is a usability decision, not a security one —
 * the guards on each page and the RLS policies underneath are what actually
 * stop access.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { actor, unread } = await pageContext(async (db, actor) => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)))

    return { actor, unread: row?.count ?? 0 }
  })

  // `satisfies` rather than a plain annotation: the trailing .filter() means the
  // array literal is not contextually typed by `NavItem[]`, so 'Operations'
  // would widen to string and the group union would go unchecked.
  const homeHref = hasPermission(actor.roles, 'submission.view_all')
    ? '/dashboard'
    : defaultRouteFor(actor.roles)

  const items: NavItem[] = (
    [
      {
        /*
         * Home is first in every portal, because it is where signing in lands
         * you and a navigation whose first item is not the landing page makes
         * people hunt for the way back.
         *
         * Its destination is role-dependent. Most people get the command
         * centre. An Engineer cannot: that page reports on everybody's work,
         * and `submission.view_all` is exactly the permission an Engineer must
         * not hold — they see their own site reports and no one else's. So
         * their Home is their own portal, and the duplicate Operations entry
         * pointing at the same place is dropped below rather than shown twice.
         */
        href: homeHref,
        label: 'Home',
        short: 'Home',
        icon: 'gauge',
        group: 'Overview',
        show: true,
      },
      {
        href: '/analytics',
        label: 'Analytics',
        short: 'Charts',
        icon: 'chart',
        group: 'Overview',
        show: hasPermission(actor.roles, 'submission.view_all'),
      },
      {
        href: '/engineer',
        label: 'Engineer Portal',
        short: 'Site',
        icon: 'clipboard',
        group: 'Operations',
        show: hasPermission(actor.roles, 'submission.create'),
      },
      {
        href: '/technical',
        label: 'Technical Office',
        short: 'Office',
        icon: 'inbox',
        group: 'Operations',
        show: hasPermission(actor.roles, 'submission.review'),
      },
      {
        href: '/approvals',
        label: 'Director Portal',
        short: 'Approve',
        icon: 'stamp',
        group: 'Operations',
        show: hasPermission(actor.roles, 'approval.decide') && actor.roles.includes('director'),
      },
      {
        href: '/technical/studio',
        label: 'AI Document Studio',
        short: 'Studio',
        icon: 'sparkles',
        group: 'Operations',
        show: hasPermission(actor.roles, 'document.create'),
      },
      {
        href: '/technical/documents',
        label: 'Documents',
        short: 'Docs',
        icon: 'file',
        group: 'Operations',
        show: hasPermission(actor.roles, 'document.create'),
      },
      {
        href: '/technical/deliveries',
        label: 'Deliveries',
        short: 'Deliver',
        icon: 'truck',
        group: 'Operations',
        show: hasPermission(actor.roles, 'delivery.sign'),
      },
      {
        href: '/technical/clients',
        label: 'Clients',
        short: 'Clients',
        icon: 'building',
        group: 'Records',
        show: hasPermission(actor.roles, 'client.manage'),
      },
      {
        href: '/technical/projects',
        label: 'Projects',
        short: 'Projects',
        icon: 'layers',
        group: 'Records',
        show: hasPermission(actor.roles, 'project.view_all'),
      },
      {
        href: '/repository',
        label: 'Repository',
        short: 'Search',
        icon: 'search',
        group: 'Records',
        show: hasPermission(actor.roles, 'document.view'),
      },
      {
        href: '/compliance',
        label: 'Compliance',
        short: 'Comply',
        icon: 'shieldcheck',
        group: 'Records',
        show: hasPermission(actor.roles, 'compliance.view'),
      },
      {
        href: '/admin/settings',
        label: 'Company settings',
        short: 'Settings',
        icon: 'sliders',
        group: 'Administration',
        show: hasPermission(actor.roles, 'config.manage'),
      },
      {
        href: '/admin/assets',
        label: 'Brand assets',
        short: 'Brand',
        icon: 'image',
        group: 'Administration',
        // Also reachable by Directors, who are the only people who can upload
        // their own signature.
        show:
          hasPermission(actor.roles, 'asset.manage') ||
          hasPermission(actor.roles, 'asset.upload_own_signature'),
      },
      {
        href: '/admin/brand-training',
        label: 'Brand training',
        short: 'Train',
        icon: 'sparkles',
        group: 'Administration',
        show: hasPermission(actor.roles, 'config.manage'),
      },
      {
        href: '/admin/users',
        label: 'People and roles',
        short: 'People',
        icon: 'users',
        group: 'Administration',
        show: hasPermission(actor.roles, 'user.manage'),
      },
      {
        href: '/admin/audit',
        label: 'Audit trail',
        short: 'Audit',
        icon: 'shield',
        group: 'Administration',
        show: hasPermission(actor.roles, 'audit.view'),
      },
    ] satisfies NavItem[]
  )
    .filter((item) => item.show)
    // Home may already be somebody's portal. One destination, one entry.
    .filter((item, i, all) => i === all.findIndex((o) => o.href === item.href))

  return (
    <AppNav
      items={items}
      unread={unread}
      user={{
        name: actor.fullName,
        email: actor.email,
        roles: actor.roles.map((r) => ROLE_LABELS[r]),
      }}
    >
      {children}
    </AppNav>
  )
}
