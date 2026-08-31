'use client'

import { Moon, Sun } from 'lucide-react'

/**
 * One button. Press it for dark, press it again for light.
 *
 * This was a three-way control — light, dark, and system — and system was a
 * defensible default: a phone that dims itself at dusk should dim this too. But
 * three unlabelled icons in a header read as a puzzle rather than a switch, and
 * HA GROUP asked for a switch. The device still decides until the moment
 * somebody presses the button; from then on their choice does.
 *
 * The chosen value is written to `data-theme` on <html> and to localStorage.
 * `THEME_SCRIPT` below re-applies it before first paint — without that, every
 * navigation would flash the light theme before React hydrated, which is worse
 * on the eye than having no dark mode at all.
 *
 * Both icons are rendered and CSS decides which is visible, keyed off the same
 * three selectors the palette uses. That matters: the server cannot know a
 * visitor's system preference, so picking the icon in JavaScript would either
 * mismatch on hydration or flash the wrong glyph for a frame. Letting CSS decide
 * costs one hidden <svg> and is correct immediately.
 */

export type Theme = 'light' | 'dark'

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

/**
 * @param tone `shell` for the public site's header, `surface` for the
 * application's panels.
 *
 * `shell` once hard-coded white, from when the public header was permanently
 * dark. The header later became transparent over the hero, which is near-white
 * in the light theme, so the control was white on white and effectively
 * invisible — while the navigation links beside it stayed readable because they
 * use the `shell-fg` token. It uses that same token now.
 */
export function ThemeToggle({ tone = 'surface' }: { tone?: 'surface' | 'shell' }) {
  const onShell = tone === 'shell'

  function toggle() {
    const root = document.documentElement

    // What is on screen right now, which is not the same as what has been
    // chosen: with nothing stored, the device decides.
    const current =
      root.dataset.theme ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const next: Theme = current === 'dark' ? 'light' : 'dark'

    root.dataset.theme = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage unavailable (private window, blocked site data). The theme still
      // applies for this page; it simply will not be remembered.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Switch between light and dark"
      className={`flex size-9 items-center justify-center rounded-full border transition-colors ${
        onShell
          ? 'border-shell-fg/25 text-shell-fg/70 hover:border-shell-fg/50 hover:text-shell-fg'
          : 'border-ink-300 text-ink-500 hover:border-ink-400 hover:text-ink-800'
      }`}
    >
      {/* Each glyph names what pressing will do, so the icon is the label. */}
      <Moon className="theme-when-light size-4" aria-hidden="true" />
      <Sun className="theme-when-dark size-4" aria-hidden="true" />
      <span className="theme-when-light sr-only">Switch to dark mode</span>
      <span className="theme-when-dark sr-only">Switch to light mode</span>
    </button>
  )
}
