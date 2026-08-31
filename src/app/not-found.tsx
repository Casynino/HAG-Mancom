import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <p className="text-xs font-semibold tracking-[0.18em] text-brand-600 uppercase">
        HA GROUP TZ LTD
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-ink-900">That page does not exist</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        It may have been moved, or you may not have access to it.
      </p>
      <Link
        href="/"
        className="tap mt-6 inline-flex items-center btn-primary rounded-lg px-5 text-sm font-medium text-white"
      >
        Back to your work
      </Link>
    </main>
  )
}
