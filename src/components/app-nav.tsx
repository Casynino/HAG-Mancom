'use client'

import Image from 'next/image'
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

/**
 * A mark beside each group heading.
 *
 * Small uppercase headings all look the same at a glance, which is what makes a
 * long sidebar tiring to scan. A glyph gives each band a shape the eye can find
 * without reading, so somebody who lives in Administration stops re-reading four
 * headings to get there.
 */
const GROUP_ICONS: Record<(typeof GROUP_ORDER)[number] | 'System', LucideIcon> = {
  Overview: Gauge,
  Operations: Inbox,
  Records: Layers,
  Administration: SlidersHorizontal,
  System: Bell,
}

/**
 * One row in the sidebar. Extracted because it was written out three times —
 * groups, System, and the phone menu — and the active treatment had already
 * drifted between them.
 *
 * Active is an outlined pill in the live gold rather than a filled block: on a
 * navy ground a fill reads as a button somebody is about to press, while an
 * outline reads as "you are here", which is what it means.
 */
function NavRow({
  href,
  label,
  Icon,
  active,
  trailing,
  onClick,
}: {
  href: string
  label: string
  Icon: LucideIcon
  active: boolean
  trailing?: React.ReactNode
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
        active
          ? 'border-live-400/45 bg-live-400/10 font-medium text-live-300'
          : 'border-transparent text-white/60 hover:bg-sidebar-hover/60 hover:text-white',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {label}
      {trailing}
    </Link>
  )
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

/** One row in the phone menu. Mirrors NavRow, in the light palette. */
function MobileRow({
  item,
  active,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  onNavigate: () => void
}) {
  const Icon = ICONS[item.icon] ?? ClipboardList
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-3 text-sm transition-colors',
        active
          ? 'border-brand-600/40 bg-brand-600/10 font-medium text-brand-700'
          : 'border-transparent text-ink-700 hover:bg-ink-50',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  )
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
  const home = items.find((i) => i.label === 'Home')

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* ---------------- Desktop sidebar ---------------- */}
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          {/*
           * HA GROUP's own mark, taken from their invoices — not the "HAG"
           * lettering that stood here, which was scaffolding I never replaced.
           * The mark is drawn in black, so it is knocked out to white for the
           * navy sidebar; the sidebar is dark in both themes, so this is a fixed
           * filter rather than the theme-dependent one the public header uses.
           */}
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Image
              src="/brand/ha-group-logo-transparent.png"
              alt=""
              width={301}
              height={254}
              priority
              className="h-6 w-auto"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
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
          {/* Home stands outside the groups. It is the one destination that is
              not a department, and giving it a heading of its own said nothing. */}
          {home ? (
            <div className="mb-4">
              <NavRow
                href={home.href}
                label={home.label}
                Icon={ICONS[home.icon] ?? Gauge}
                active={isActive(pathname, home.href)}
              />
            </div>
          ) : null}

          {GROUP_ORDER.map((group) => {
            const inGroup = items.filter((i) => i.group === group && i !== home)
            if (inGroup.length === 0) return null
            const GroupIcon = GROUP_ICONS[group]

            return (
              <div key={group} className="mb-5">
                <p className="flex items-center gap-2 px-3 pb-2 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">
                  <GroupIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  {group}
                </p>

                {/* The rule ties a band together and the indent says these
                    belong to the heading above rather than floating beside it. */}
                <div className="ml-4 space-y-0.5 border-l border-white/10 pl-2.5">
                  {inGroup.map((item) => (
                    <NavRow
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      Icon={ICONS[item.icon] ?? ClipboardList}
                      active={isActive(pathname, item.href)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          <div className="mb-5">
            <p className="flex items-center gap-2 px-3 pb-2 text-[10px] font-semibold tracking-[0.16em] text-white/35 uppercase">
              <Bell className="size-3.5 shrink-0" aria-hidden="true" />
              System
            </p>
            <div className="ml-4 space-y-0.5 border-l border-white/10 pl-2.5">
              <NavRow
                href="/notifications"
                label="Notifications"
                Icon={Bell}
                active={pathname === '/notifications'}
                trailing={
                  unread > 0 ? (
                    <span className="ml-auto rounded-full bg-live-400 px-1.5 py-0.5 text-[11px] font-semibold text-sidebar tabular">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  ) : null
                }
              />
            </div>
          </div>
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[10px] tracking-[0.14em] text-white/35 uppercase">Theme</span>
            <ThemeToggle tone="shell" />
          </div>

          {/* The person, as a card. An initial in a disc is faster to recognise
              across a desk than a name in the same weight as everything else,
              and the role beneath it answers "why can I not see that page". */}
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 transition-colors hover:bg-white/[0.08]"
          >
            <span className="font-display flex size-9 shrink-0 items-center justify-center rounded-full bg-live-400/20 text-sm font-bold text-live-300">
              {user.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-white">{user.name}</span>
              <span className="block truncate text-xs text-white/45">{user.roles.join(' · ')}</span>
            </span>
          </Link>

          <form action={signOutAction} className="mt-2">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/12 py-2.5 text-sm text-white/70 transition-colors hover:border-white/25 hover:text-white"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>

          <p className="mt-3 text-center text-[10px] tracking-[0.12em] text-white/25 uppercase">
            HA GROUP TZ LTD
          </p>
        </div>
      </aside>

      {/* ---------------- Mobile top bar ---------------- */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-200 bg-panel px-4 py-3 lg:hidden">
        {/* The same identity the sidebar carries. It read "HA GROUP / AI
            Operations" here and "MANCOM / Operations Platform" there, which is
            two names for one product depending on which device you opened. */}
        <Link href={home?.href ?? '/'} className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar">
            <Image
              src="/brand/ha-group-logo-transparent.png"
              alt=""
              width={301}
              height={254}
              priority
              className="h-5 w-auto"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </span>
          <span className="min-w-0">
            <span className="font-display block truncate text-sm font-bold tracking-wide text-ink-950">
              MANCOM
            </span>
            <span className="block truncate text-[9px] tracking-[0.14em] text-ink-500 uppercase">
              Operations Platform
            </span>
          </span>
        </Link>
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
          {/* The same bands as the sidebar. A flat list of fifteen destinations
              on a phone is a wall; grouped, it is four short reads. */}
          <nav className="max-h-[70dvh] overflow-y-auto p-2" aria-label="All sections">
            {home ? (
              <div className="mb-3">
                <MobileRow
                  item={home}
                  active={isActive(pathname, home.href)}
                  onNavigate={() => setMenuOpen(false)}
                />
              </div>
            ) : null}

            {GROUP_ORDER.map((group) => {
              const inGroup = items.filter((i) => i.group === group && i !== home)
              if (inGroup.length === 0) return null
              const GroupIcon = GROUP_ICONS[group]

              return (
                <div key={group} className="mb-3">
                  <p className="flex items-center gap-2 px-3 pb-1.5 text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                    <GroupIcon className="size-3.5 shrink-0" aria-hidden="true" />
                    {group}
                  </p>
                  <div className="ml-3 space-y-0.5 border-l border-ink-200 pl-2">
                    {inGroup.map((item) => (
                      <MobileRow
                        key={item.href}
                        item={item}
                        active={isActive(pathname, item.href)}
                        onNavigate={() => setMenuOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            <div className="mb-1">
              <p className="flex items-center gap-2 px-3 pb-1.5 text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
                <Bell className="size-3.5 shrink-0" aria-hidden="true" />
                System
              </p>
              <div className="ml-3 space-y-0.5 border-l border-ink-200 pl-2">
                <Link
                  href="/notifications"
                  onClick={() => setMenuOpen(false)}
                  aria-current={pathname === '/notifications' ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-3 text-sm transition-colors',
                    pathname === '/notifications'
                      ? 'border-brand-600/40 bg-brand-600/10 font-medium text-brand-700'
                      : 'border-transparent text-ink-700 hover:bg-ink-50',
                  )}
                >
                  <Bell className="size-4 shrink-0" aria-hidden="true" />
                  Notifications
                  {unread > 0 ? (
                    <span className="ml-auto rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold text-white tabular">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  ) : null}
                </Link>
              </div>
            </div>
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
          {/*
              max-w-5xl is 1024px, which was sized for reading. These pages are
              not read, they are scanned: strips of four and five figures, tables
              with eight columns, two-up panels. At 1024 a wide monitor showed a
              column of content floating between two margins of nothing, while
              the tables inside it scrolled. Prose keeps its own max-w-2xl where
              it appears, so widening the shell costs nothing in line length.
          */}
          <div className="mx-auto w-full max-w-[104rem] space-y-5">{children}</div>
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
