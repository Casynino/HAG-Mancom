import type { Metadata } from 'next'

/** Nothing behind sign-in belongs in a search index. */
export const metadata: Metadata = { robots: { index: false, follow: false } }

import { and, eq, isNull, sql } from 'drizzle-orm'
import { notifications } from '@/db/schema'
import { AppNav, type NavItem } from '@/components/app-nav'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission, ROLE_LABELS } from '@/lib/authz/roles'

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

  const items: NavItem[] = [
    {
      href: '/engineer',
      label: 'My site work',
      short: 'Site',
      icon: 'clipboard',
      show: hasPermission(actor.roles, 'submission.create'),
    },
    {
      href: '/technical',
      label: 'Review queue',
      short: 'Review',
      icon: 'inbox',
      show: hasPermission(actor.roles, 'submission.review'),
    },
    {
      href: '/approvals',
      label: 'Approvals',
      short: 'Approve',
      icon: 'stamp',
      show: hasPermission(actor.roles, 'approval.decide') && actor.roles.includes('director'),
    },
    {
      href: '/technical/documents',
      label: 'Documents',
      short: 'Docs',
      icon: 'file',
      show: hasPermission(actor.roles, 'document.create'),
    },
    {
      href: '/repository',
      label: 'Repository',
      short: 'Search',
      icon: 'search',
      show: hasPermission(actor.roles, 'document.view'),
    },
    {
      href: '/technical/clients',
      label: 'Clients',
      short: 'Clients',
      icon: 'building',
      show: hasPermission(actor.roles, 'client.manage'),
    },
    {
      href: '/technical/deliveries',
      label: 'Deliveries',
      short: 'Deliver',
      icon: 'truck',
      show: hasPermission(actor.roles, 'delivery.sign'),
    },
    {
      href: '/compliance',
      label: 'Compliance',
      short: 'Comply',
      icon: 'shieldcheck',
      show: hasPermission(actor.roles, 'compliance.view'),
    },
    {
      href: '/technical/projects',
      label: 'Projects',
      short: 'Projects',
      icon: 'layers',
      show: hasPermission(actor.roles, 'project.view_all'),
    },
    {
      href: '/dashboard',
      label: 'Overview',
      short: 'Overview',
      icon: 'gauge',
      show: hasPermission(actor.roles, 'submission.view_all'),
    },
    {
      href: '/admin/settings',
      label: 'Company settings',
      short: 'Settings',
      icon: 'sliders',
      show: hasPermission(actor.roles, 'config.manage'),
    },
    {
      href: '/admin/assets',
      label: 'Brand assets',
      short: 'Brand',
      icon: 'image',
      // Also reachable by Directors, who are the only people who can upload
      // their own signature.
      show:
        hasPermission(actor.roles, 'asset.manage') ||
        hasPermission(actor.roles, 'asset.upload_own_signature'),
    },
    {
      href: '/admin/users',
      label: 'People and roles',
      short: 'People',
      icon: 'users',
      show: hasPermission(actor.roles, 'user.manage'),
    },
    {
      href: '/admin/audit',
      label: 'Audit trail',
      short: 'Audit',
      icon: 'shield',
      show: hasPermission(actor.roles, 'audit.view'),
    },
  ].filter((item) => item.show)

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
