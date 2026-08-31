import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getActor } from '@/lib/authz/guard'
import { defaultRouteFor } from '@/lib/authz/roles'
import { SignInForm } from './sign-in-form'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Sign in',
}

export default async function SignInPage() {
  const actor = await getActor()
  if (actor) redirect(actor.mustChangePassword ? '/change-password' : defaultRouteFor(actor.roles))

  return (
    <main className="flex min-h-dvh flex-col justify-center px-4 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-600 uppercase">
            HA GROUP TZ LTD
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink-900">
            AI Operations Platform
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Sign in with the account your administrator issued.
          </p>
        </div>

        <SignInForm />

        <p className="mt-8 text-xs text-ink-400">
          Access is monitored and recorded. If you cannot sign in, contact your administrator —
          repeated failed attempts lock the account for 15 minutes.
        </p>
      </div>
    </main>
  )
}
