'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { projects } from '@/lib/company/profile'

/**
 * The public header.
 *
 * Staff Login is a deliberate, permanent fixture rather than a link buried in
 * the footer: for HA GROUP's own engineers this site is the way in to the
 * operations platform, and they reach for it on a phone on site. It is styled
 * as a distinct object from the marketing navigation so it reads as a door,
 * not another page.
 *
 * `signedIn` is resolved on the server and passed down, so someone already
 * holding a session is offered their work rather than a login form they do not
 * need. It carries no identity — only whether a session cookie resolved.
 */

const NAV = [
  { href: '/services', label: 'Services' },
  // Only offered once there is real completed work to show. A menu item leading
  // to an empty portfolio is worse than no menu item.
  ...(projects.length > 0 ? [{ href: '/projects', label: 'Projects' }] : []),
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-shell/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tight text-white"
          onClick={() => setOpen(false)}
        >
          HA GROUP
        </Link>

        <nav className="ml-auto hidden items-center gap-7 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative text-sm transition-colors ${
                  active ? 'text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                {item.label}
                {active ? (
                  <span
                    className="absolute -bottom-1.5 left-0 h-px w-full bg-live-400"
                    aria-hidden="true"
                  />
                ) : null}
              </Link>
            )
          })}
        </nav>

        <div className="hidden md:block">
          <ThemeToggle tone="shell" />
        </div>

        <Link
          href={signedIn ? '/dashboard' : '/sign-in'}
          className="hidden h-9 items-center rounded border border-white/25 px-4 text-sm font-medium text-white transition-colors hover:border-live-400 hover:text-live-300 md:inline-flex"
        >
          {signedIn ? 'Go to portal' : 'Staff login'}
        </Link>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex size-10 items-center justify-center rounded text-white md:hidden"
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-white/10 bg-shell md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col px-5 py-2 sm:px-8">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-b border-white/5 py-3.5 text-white/80"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={signedIn ? '/dashboard' : '/sign-in'}
              onClick={() => setOpen(false)}
              className="mt-3 mb-3 flex h-11 items-center justify-center rounded border border-live-400/50 text-sm font-medium text-live-300"
            >
              {signedIn ? 'Go to portal' : 'Staff login'}
            </Link>

            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-white/50">Theme</span>
              <ThemeToggle tone="shell" />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
