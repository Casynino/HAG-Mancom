'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Bell,
  Building2,
  ClipboardList,
  FileText,
  Gauge,
  Inbox,
  Layers,
  LogOut,
  Menu,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Stamp,
  Truck,
  Image as ImageIcon,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/components/ui'
import { signOutAction } from '@/server/auth-actions'

/**
 * Application chrome.
 *
 * Two distinct layouts rather than one that stretches: a bottom tab bar on
 * phones, because Engineers use this one-handed on site, and a persistent
 * sidebar on desktop, where the Technical Officer works through a queue.
 */

const ICONS: Record<string, LucideIcon> = {
  clipboard: ClipboardList,
  inbox: Inbox,
  building: Building2,
  layers: Layers,
  gauge: Gauge,
  sliders: SlidersHorizontal,
  users: Users,
  shield: Shield,
  stamp: Stamp,
  file: FileText,
  search: Search,
  shieldcheck: ShieldCheck,
  truck: Truck,
  image: ImageIcon,
}

export interface NavItem {
  href: string
  label: string
  short: string
  icon: string
  show?: boolean
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/engineer') return pathname === '/engineer' || pathname.startsWith('/engineer/')
  if (href === '/technical') {
    // "Review queue" must not light up while on Clients, Projects or Documents.
    return pathname === '/technical' || pathname.startsWith('/technical/submissions')
  }
  if (href === '/technical/documents') {
    return pathname.startsWith('/technical/documents')
  }
  return pathname === href || pathname.startsWith(href + '/')
}

export function AppNav({
  items,
  unread,
  user,
  children,
}: {
  items: NavItem[]
  unread: number
  user: { name: string; email: string; roles: string[] }
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  // The four most relevant destinations get the phone tab bar; everything else
  // lives behind the menu. More than five tabs stops being a tab bar.
  const primary = items.slice(0, 4)

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* ---------------- Desktop sidebar ---------------- */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-200 bg-white lg:flex">
        <div className="border-b border-ink-200 px-5 py-4">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-brand-600 uppercase">
            HA GROUP
          </p>
          <p className="mt-0.5 text-sm font-semibold text-ink-900">AI Operations</p>
        </div>

        <nav className="flex-1 space-y-0.5 p-3" aria-label="Main">
          {items.map((item) => {
            const Icon = ICONS[item.icon] ?? ClipboardList
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}

          <Link
            href="/notifications"
            aria-current={pathname === '/notifications' ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors',
              pathname === '/notifications'
                ? 'bg-brand-50 font-medium text-brand-700'
                : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900',
            )}
          >
            <Bell className="size-4 shrink-0" aria-hidden="true" />
            Notifications
            {unread > 0 ? (
              <span className="ml-auto rounded bg-brand-600 px-1.5 py-0.5 text-[11px] font-medium text-white tabular">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </Link>
        </nav>

        <div className="border-t border-ink-200 p-3">
          <p className="truncate px-3 text-sm font-medium text-ink-900">{user.name}</p>
          <p className="truncate px-3 text-xs text-ink-500">{user.roles.join(' · ')}</p>
          <form action={signOutAction} className="mt-2">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ---------------- Mobile top bar ---------------- */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 lg:hidden">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.18em] text-brand-600 uppercase">
            HA GROUP
          </p>
          <p className="text-sm font-semibold text-ink-900">AI Operations</p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/notifications"
            className="relative flex size-11 items-center justify-center rounded text-ink-600 hover:bg-ink-50"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          >
            <Bell className="size-5" aria-hidden="true" />
            {unread > 0 ? (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand-600" />
            ) : null}
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex size-11 items-center justify-center rounded text-ink-600 hover:bg-ink-50"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div className="border-b border-ink-200 bg-white lg:hidden">
          <nav className="p-2" aria-label="All sections">
            {items.map((item) => {
              const Icon = ICONS[item.icon] ?? ClipboardList
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 rounded px-3 py-3 text-sm text-ink-700 hover:bg-ink-50"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="border-t border-ink-200 p-3">
            <p className="px-3 text-sm font-medium text-ink-900">{user.name}</p>
            <p className="px-3 text-xs text-ink-500">{user.roles.join(' · ')}</p>
            <form action={signOutAction} className="mt-1">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded px-3 py-3 text-sm text-ink-700 hover:bg-ink-50"
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* ---------------- Content ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-8">
          <div className="mx-auto w-full max-w-5xl space-y-5">{children}</div>
        </main>
      </div>

      {/* ---------------- Mobile tab bar ---------------- */}
      {primary.length > 1 ? (
        <nav
          className="fixed inset-x-0 bottom-0 z-20 grid border-t border-ink-200 bg-white lg:hidden"
          style={{
            gridTemplateColumns: `repeat(${primary.length}, minmax(0, 1fr))`,
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
          aria-label="Primary"
        >
          {primary.map((item) => {
            const Icon = ICONS[item.icon] ?? ClipboardList
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 py-2.5 text-[11px]',
                  active ? 'font-medium text-brand-700' : 'text-ink-500',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.short}
              </Link>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
