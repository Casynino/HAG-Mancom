import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
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

/**
 * Where HA GROUP is incorporated, as the company states it on its own About
 * page. Written out under the form because the globe shows the offices turning
 * and somebody reading rather than looking should get the same answer.
 */
const COUNTRIES = [
  'Tanzania',
  'Zimbabwe',
  'Zambia',
  'Malawi',
  'Mozambique',
  'Botswana',
  'South Africa',
  'United Kingdom',
]

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
      {/*
       * The ground. A flat navy read as a browser default with a form on it, so
       * this is three lights instead: a teal one low and left where the arcs
       * begin, the company's gold behind the globe, and a deep indigo filling
       * the rest. Dark enough that white type sits on it without a scrim, warm
       * enough that it does not look like a terminal.
       */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[#0b1220]" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_70%_28%,rgba(58,92,160,0.55)_0%,rgba(26,42,78,0.35)_42%,transparent_72%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_12%_88%,rgba(24,120,132,0.30)_0%,transparent_62%)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_55%_at_78%_62%,rgba(226,178,96,0.16)_0%,transparent_65%)]"
      />
      {/*
       * The company's mark, large and barely there, breathing on a thirty
       * second cycle. It sits behind the globe and under the type at five to
       * eight percent, which is enough to be felt and not enough to compete —
       * somebody entering a password should not be watching something move.
       */}
      <span
        aria-hidden="true"
        /*
         * Centred on the globe rather than on the page. Sitting in the middle
         * of the viewport it was half-hidden behind the form and read as a
         * stray ghost; over the sphere the mark and the globe are one object,
         * which is what a watermark is for.
         */
        className="breathe pointer-events-none absolute top-1/2 left-1/2 w-[42vmin] max-w-none -translate-x-1/2 -translate-y-1/2 lg:left-[72%]"
      >
        <Image
          src="/brand/ha-group-logo-transparent.png"
          alt=""
          width={301}
          height={254}
          priority
          className="w-full"
          style={{ filter: 'brightness(0) invert(1)' }}
        />
      </span>

      <AfricaNetwork className="pointer-events-none absolute inset-0 size-full" />
      {/* A vignette, so the corners fall away and the eye goes to the middle. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_50%,transparent_45%,rgba(4,8,16,0.55)_100%)]"
      />
      {/* A faint grid, the way a drawing is set out before anything is drawn on
          it. It is the one nod to what the company actually does. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      {/* Darkens the left, where the form is, and leaves the right to the globe. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-sidebar via-sidebar/85 to-transparent lg:via-sidebar/60"
      />

      <div className="relative w-full max-w-sm lg:ml-[8vw] xl:ml-[12vw]">
        {/*
         * The way back. Somebody who lands here from the public site, or who
         * opens it by habit and is not signing in, had no route out except the
         * browser's back button — and on a phone opened from a link there is no
         * back button to press.
         */}
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to hagroup.africa
        </Link>

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

        {/*
         * One frame. The form used to wrap itself in a Panel and this page
         * wrapped it in a card, so the inputs sat inside two nested boxes on a
         * third ground — three borders competing over a two-field form. The
         * form is bare now and this is the only surface.
         */}
        {/*
         * A lift of the navy, not a black box on top of it. `bg-panel` inverts
         * with the theme and this page does not — the globe needs a dark ground
         * in both — so a themed surface here produced two darks that did not
         * belong to each other.
         */}
        <div className="rounded-2xl border border-white/12 bg-white/[0.055] p-5 shadow-2xl backdrop-blur-xl sm:p-6">
          <SignInForm />
        </div>

        <p className="mt-6 text-xs leading-relaxed text-white/40">
          Access is monitored and recorded. If you cannot sign in, contact your administrator —
          repeated failed attempts lock the account for 15 minutes.
        </p>

        {/*
         * The countries, written out. The globe shows them turning; this says
         * them, for anybody who reads before they look — and it is HA GROUP's
         * own claim, from the company profile, not a flourish.
         */}
        <div className="mt-8 border-t border-white/10 pt-5">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-live-400/70 uppercase">
            Turnkey electrical engineering across Africa
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/40">{COUNTRIES.join(' · ')}</p>
        </div>
      </div>
    </main>
  )
}
