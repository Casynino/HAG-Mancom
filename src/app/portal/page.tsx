import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowRight, Lock } from 'lucide-react'
import { getActor } from '@/lib/authz/guard'
import { defaultRouteFor } from '@/lib/authz/roles'

export const metadata: Metadata = {
  title: 'Staff Portal',
  description: 'Secure operations portal for HA GROUP TZ LTD staff.',
  robots: { index: false, follow: false },
}

/**
 * The staff entry point.
 *
 * The public website now lives in this same application, at `/`, with a Staff
 * login control in its header — so this route is no longer the only way in.
 * It is kept because it is a stable, memorable address to hand to staff and to
 * put on printed material, and because any old link to it must keep working.
 *
 * Deliberately thin: no company information, no marketing copy, nothing that
 * duplicates or competes with the public site. It exists to send a signed-in
 * person to their work and everyone else to the sign-in form.
 */
export default async function PortalPage() {
  const actor = await getActor()

  if (actor) {
    redirect(actor.mustChangePassword ? '/change-password' : defaultRouteFor(actor.roles))
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <p className="text-xs font-semibold tracking-[0.18em] text-brand-600 uppercase">
          HA GROUP TZ LTD
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
          Operations Portal
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Internal system for site submissions, quotations, invoices, approvals and company
          records. Access is restricted to HA GROUP staff.
        </p>

        <Link
          href="/sign-in"
          className="tap-lg mt-6 flex w-full items-center justify-center gap-2 rounded bg-brand-600 px-5 font-medium text-white hover:bg-brand-700"
        >
          <Lock className="size-4" aria-hidden="true" />
          Staff login
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>

        <div className="mt-8 rounded border border-ink-200 bg-panel p-4">
          <p className="text-sm font-medium text-ink-800">No account?</p>
          <p className="mt-1 text-sm text-ink-500">
            Accounts are issued by the HA GROUP administrator. Contact them directly — this system
            has no self-registration, by design.
          </p>
        </div>

        <p className="mt-8 text-xs text-ink-400">
          Every sign-in and every action in this system is recorded. Operational records, financial
          data, documents, signatures and company files are accessible only to authenticated staff.
        </p>
      </div>
    </main>
  )
}
