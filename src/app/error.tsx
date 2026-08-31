'use client'

import { useEffect } from 'react'

/**
 * Last-resort boundary. Users see a plain sentence; the detail goes to the
 * server log, never to the screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[boundary]', error)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-xs font-semibold tracking-[0.18em] text-brand-600 uppercase">
        HA GROUP TZ LTD
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-ink-900">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        Your work has not been lost. Try again, and tell your administrator if it keeps happening.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-ink-400">Reference {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="tap mt-6 inline-flex items-center rounded bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700"
      >
        Try again
      </button>
    </main>
  )
}
