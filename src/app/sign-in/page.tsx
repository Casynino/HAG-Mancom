import Image from 'next/image'
import { redirect } from 'next/navigation'
import { AfricaNetwork } from '@/components/africa-network'
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
    <main className="relative isolate flex min-h-dvh flex-col justify-center overflow-hidden bg-sidebar px-4 py-10">
      {/*
       * The company's own footprint, turning slowly. Nine cities HA GROUP
       * actually has offices in, joined to Dar es Salaam — a real claim about
       * the business, drawn rather than photographed, so it cannot be mistaken
       * for a site the company has worked on.
       */}
      <AfricaNetwork className="pointer-events-none absolute inset-0 size-full" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -left-32 size-[38rem] rounded-full bg-brand-600/25 blur-[120px]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -bottom-40 size-[32rem] rounded-full bg-live-500/15 blur-[120px]"
      />
      {/* Darkens the left, where the form is, and leaves the right to the globe. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-sidebar via-sidebar/85 to-transparent lg:via-sidebar/60"
      />

      <div className="relative w-full max-w-sm lg:ml-[8vw] xl:ml-[12vw]">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
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
            <span className="block text-[10px] font-semibold tracking-[0.18em] text-live-400 uppercase">
              HA GROUP TZ LTD
            </span>
            <span className="font-display block text-lg font-bold tracking-tight text-white">
              MANCOM
            </span>
          </span>
        </div>

        <div className="mb-7">
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Operations Platform
          </h1>
          <p className="mt-2 text-sm text-white/55">
            Sign in with the account your administrator issued.
          </p>
        </div>

        {/* The form keeps the light surface it has everywhere else, so the
            inputs read as inputs rather than as part of the artwork. */}
        <div className="rounded-2xl border border-white/10 bg-panel p-5 shadow-2xl sm:p-6">
          <SignInForm />
        </div>

        <p className="mt-6 text-xs leading-relaxed text-white/40">
          Access is monitored and recorded. If you cannot sign in, contact your administrator —
          repeated failed attempts lock the account for 15 minutes.
        </p>

        <p className="mt-8 text-[10px] tracking-[0.14em] text-white/25 uppercase">
          Turnkey electrical engineering across Africa
        </p>
      </div>
    </main>
  )
}
