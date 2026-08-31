'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Bell,
  BarChart3,
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
  Sparkles,
  Stamp,
  Truck,
  Image as ImageIcon,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/components/ui'
import { ThemeToggle } from '@/components/theme-toggle'
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
  sparkles: Sparkles,
  chart: BarChart3,
}

export interface NavItem {
  href: string
  label: string
  short: string
  icon: string
  /** Sidebar heading this item sits under. Items without one lead the list. */
  group?: 'Overview' | 'Operations' | 'Records' | 'Administration'
  show?: boolean
}

/** Fixed order, so the sidebar does not reshuffle as permissions differ. */
const GROUP_ORDER = ['Overview', 'Operations', 'Records', 'Administration'] as const

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
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          {/* The gold mark is the one warm note in the frame, and the fastest
              thing to find when glancing at a screen across a desk. */}
          <span className="font-display flex size-10 shrink-0 items-center justify-center rounded-xl bg-live-400 text-sm font-bold text-sidebar">
            HAG
          </span>
          <span className="min-w-0">
            <span className="font-display block truncate text-sm font-bold tracking-wide text-white">
              MANCOM
            </span>
            <span className="block truncate text-[10px] tracking-[0.14em] text-white/40 uppercase">
              Operations Platform
            </span>
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
          {GROUP_ORDER.map((group) => {
            const inGroup = items.filter((i) => i.group === group)
            if (inGroup.length === 0) return null

            return (
              <div key={group} className="mb-5">
                <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">
                  {group}
                </p>

                {inGroup.map((item) => {
                  const Icon = ICONS[item.icon] ?? ClipboardList
                  const active = isActive(pathname, item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                        active
                          ? 'bg-sidebar-hover font-medium text-white'
                          : 'text-white/60 hover:bg-sidebar-hover/60 hover:text-white',
                      )}
                    >
                      {active ? (
                        <span
                          className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r bg-live-400"
                          aria-hidden="true"
                        />
                      ) : null}
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )
          })}

          <div className="mb-5">
            <p className="px-3 pb-2 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">
              System
            </p>
            <Link
              href="/notifications"
              aria-current={pathname === '/notifications' ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                pathname === '/notifications'
                  ? 'bg-sidebar-hover font-medium text-white'
                  : 'text-white/60 hover:bg-sidebar-hover/60 hover:text-white',
              )}
            >
              {pathname === '/notifications' ? (
                <span
                  className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r bg-live-400"
                  aria-hidden="true"
                />
              ) : null}
              <Bell className="size-4 shrink-0" aria-hidden="true" />
              Notifications
              {unread > 0 ? (
                <span className="ml-auto rounded-full bg-live-400 px-1.5 py-0.5 text-[11px] font-semibold text-sidebar tabular">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </Link>
          </div>
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] tracking-[0.14em] text-white/35 uppercase">Theme</span>
            <ThemeToggle tone="shell" />
          </div>

          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-white/45">{user.roles.join(' · ')}</p>

          <form action={signOutAction} className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-lg py-2 text-sm text-white/55 transition-colors hover:text-white"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ---------------- Mobile top bar ---------------- */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-200 bg-panel px-4 py-3 lg:hidden">
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
        <div className="border-b border-ink-200 bg-panel lg:hidden">
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

            <div className="mt-3 flex items-center justify-between px-3">
              <span className="text-xs text-ink-500">Theme</span>
              <ThemeToggle />
            </div>

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
          className="fixed inset-x-0 bottom-0 z-20 grid border-t border-ink-200 bg-panel lg:hidden"
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
