import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Notice } from '@/components/ui'
import { getActor } from '@/lib/authz/guard'
import { ChangePasswordForm } from './change-password-form'

export const metadata: Metadata = {
  robots: { index: false, follow: false }, title: 'Change password' }

/**
 * Reachable while `mustChangePassword` is set, which is exactly when
 * `requireActor` would bounce the user here — so this page resolves the session
 * itself rather than using that guard.
 */
export default async function ChangePasswordPage() {
  const actor = await getActor()
  if (!actor) redirect('/sign-in')

  return (
    <main className="flex min-h-dvh flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-600 uppercase">
            HA GROUP TZ LTD
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink-900">
            {actor.mustChangePassword ? 'Set your password' : 'Change your password'}
          </h1>
        </div>

        {actor.mustChangePassword ? (
          <div className="mb-4">
            <Notice tone="warn" title="Choose your own password before continuing">
              You are signed in with a temporary password issued by your administrator. Replace it
              to reach the rest of the platform.
            </Notice>
          </div>
        ) : null}

        <ChangePasswordForm />

        <p className="mt-6 text-xs text-ink-400">
          Use at least 12 characters. Changing your password signs you out everywhere else.
        </p>
      </div>
    </main>
  )
}
