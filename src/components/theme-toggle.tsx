'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

/**
 * Light / dark / system.
 *
 * Three states, not two. "System" is the default and is a real choice, not the
 * absence of one: a phone that dims itself at dusk should dim this too, and an
 * engineer reading a site report at night has already told their device what
 * they want. Offering only a two-way switch quietly overrides that.
 *
 * The chosen value is written to `data-theme` on <html> and to localStorage.
 * `THEME_SCRIPT` below re-applies it before first paint — without that, every
 * navigation would flash the light theme before React hydrated, which is worse
 * on the eye than having no dark mode at all.
 */

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'hag-theme'

/**
 * Runs blocking in <head>, before anything is painted. Deliberately terse and
 * dependency-free, and wrapped in try/catch: a browser with site data blocked
 * throws on localStorage access, and a themed page is not worth a blank one.
 */
export const THEME_SCRIPT = `
try {
  var t = localStorage.getItem('${STORAGE_KEY}');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) {}
`.trim()

const OPTIONS: Array<{ value: Theme; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

function apply(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme

  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage unavailable (private window, blocked site data). The theme still
    // applies for this page; it simply will not be remembered.
  }
}

/**
 * @param tone `shell` for the public site's header, `surface` for the
 * application's panels.
 *
 * `shell` once meant "on a permanently dark header" and hard-coded white. The
 * public header later became transparent over the hero, which is near-white in
 * the light theme — so the control was white on white and effectively invisible,
 * while the navigation links beside it stayed readable because they use the
 * `shell-fg` token. It now uses that same token, so it is exactly as legible as
 * the words next to it, in either theme.
 */
export function ThemeToggle({ tone = 'surface' }: { tone?: 'surface' | 'shell' }) {
  const [theme, setTheme] = useState<Theme>('system')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {
      stored = null
    }
    setTheme(stored === 'dark' || stored === 'light' ? stored : 'system')
    setReady(true)
  }, [])

  function choose(next: Theme) {
    setTheme(next)
    apply(next)
  }

  const onShell = tone === 'shell'

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex items-center gap-0.5 rounded-full border p-0.5 ${
        onShell ? 'border-shell-fg/25' : 'border-ink-300'
      }`}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        // Before hydration nothing is marked active, so the server and client
        // markup agree and React does not warn about a mismatch.
        const active = ready && theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={`flex size-7 items-center justify-center rounded-full transition-colors ${
              active
                ? onShell
                  ? 'bg-shell-fg/15 text-shell-fg'
                  : 'bg-ink-200 text-ink-900'
                : onShell
                  ? 'text-shell-fg/55 hover:text-shell-fg'
                  : 'text-ink-500 hover:text-ink-800'
            }`}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
