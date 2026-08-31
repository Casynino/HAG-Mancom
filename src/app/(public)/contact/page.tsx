import type { Metadata } from 'next'
import Image from 'next/image'
import { Mail, Phone } from 'lucide-react'
import { company, offices, SOURCE_NOTE } from '@/lib/company/profile'
import { IMAGERY_NOTE, photos } from '@/lib/company/imagery'

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'HA GROUP offices in South Africa, Tanzania, Zimbabwe, Zambia, Malawi, Mozambique, ' +
    'Botswana and the United Kingdom, with direct telephone numbers.',
}

/**
 * Every office, with tappable numbers.
 *
 * There is no contact form. A form would need a configured mail provider to
 * deliver anything, and the platform does not have one — a form that silently
 * discards enquiries is worse than no form. The email address and the direct
 * numbers work today, on a phone, with one tap.
 */
export default function ContactPage() {
  const head = offices.filter((o) => o.isHeadOffice)
  const rest = offices.filter((o) => !o.isHeadOffice)

  return (
    <>
      <header className="relative isolate overflow-hidden border-b border-shell-fg/10 bg-shell text-shell-fg">
        <Image
          src={photos.transmission.src}
          alt=""
          fill
          priority
          sizes="100vw"
          className="pointer-events-none object-cover"
          style={{ opacity: 'calc(var(--hero-photo-opacity) * 0.8)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'var(--hero-scrim)' }}
        />
        <div className="relative mx-auto max-w-6xl px-5 pt-28 pb-20 sm:px-8 sm:pt-32 sm:pb-24">
          <p className="text-xs font-semibold tracking-[0.18em] text-live-400 uppercase">
            Network &amp; offices
          </p>
          <h1 className="font-display mt-5 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Talk to the office nearest the site
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-shell-fg/70">
            Enquiries about projects, maintenance contracts or equipment supply reach us fastest by
            email.
          </p>
          <a
            href={`mailto:${company.primaryEmail}`}
            className="mt-8 inline-flex h-12 items-center gap-2 rounded bg-shell-fg px-6 font-medium text-shell transition-colors hover:bg-live-300"
          >
            <Mail className="size-4" aria-hidden="true" />
            {company.primaryEmail}
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        {head.map((o) => (
          <section
            key={o.city}
            className="grid overflow-hidden rounded-2xl border border-ink-200 lg:grid-cols-[1.1fr_1fr]"
          >
            <div className="relative min-h-64 bg-ink-100">
              <Image
                src={photos.mining.src}
                alt={photos.mining.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-shell/70 to-transparent"
              />
            </div>

            <div className="p-7 sm:p-9">
              <p className="text-xs font-semibold tracking-[0.16em] text-live-700 uppercase">
                Head office
              </p>
              <h2 className="font-display mt-3 text-2xl font-bold tracking-tight text-ink-950">
                {o.city}, {o.country}
              </h2>
              <address className="mt-3 leading-relaxed text-ink-600 not-italic">
                {o.address}
              </address>
              <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
                {o.phones.map((p) => (
                  <li key={p}>
                    <a
                      href={`tel:${p.replace(/\s/g, '')}`}
                      className="flex items-center gap-2 font-medium text-brand-700 tabular hover:underline"
                    >
                      <Phone className="size-4" aria-hidden="true" />
                      {p}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}

        <h2 className="font-display mt-16 text-2xl font-bold tracking-tight text-ink-950">
          Regional offices
        </h2>

        <div className="mt-8 grid gap-px overflow-hidden rounded border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((o) => (
            <section key={`${o.country}-${o.city}`} className="bg-panel p-6">
              <h3 className="font-display text-lg font-semibold text-ink-950">{o.country}</h3>
              <p className="text-sm text-ink-500">{o.city}</p>
              <address className="mt-3 text-sm leading-relaxed text-ink-600 not-italic">
                {o.address}
              </address>
              <ul className="mt-3 space-y-1">
                {o.phones.map((p) => (
                  <li key={p}>
                    <a
                      href={`tel:${p.replace(/\s/g, '')}`}
                      className="text-sm text-brand-700 tabular hover:underline"
                    >
                      {p}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-12 text-xs text-ink-400">
          {SOURCE_NOTE} {IMAGERY_NOTE}
        </p>
      </div>
    </>
  )
}
