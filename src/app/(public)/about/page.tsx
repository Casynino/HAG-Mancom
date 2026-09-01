import type { Metadata } from 'next'
import Image from 'next/image'
import { company, countries, divisions, partners, values } from '@/lib/company/profile'
import { IMAGERY_NOTE, photos } from '@/lib/company/imagery'

export const metadata: Metadata = {
  title: 'About',
  description:
    'HA GROUP is a turnkey electrical projects company registered in Zimbabwe in 2007 and ' +
    'incorporated across eight countries in Africa and the United Kingdom.',
}

export default function AboutPage() {
  return (
    <>
      <header className="relative isolate overflow-hidden border-b border-shell-fg/10 bg-shell text-shell-fg">
        <Image
          src={photos.electrician.src}
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
            Who we are
          </p>
          <h1 className="font-display mt-5 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            {company.benchmark.split('.')[0]}.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-shell-fg/70">
            {company.benchmark.split('.').slice(1).join('.').trim()}
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-ink-100">
            <Image
              src={photos.team.src}
              alt={photos.team.alt}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover transition-transform duration-[900ms] group-hover:scale-105"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-shell/60 to-transparent"
            />
          </div>
          <div className="self-center">
            <h2 className="font-display text-3xl font-bold tracking-tight text-ink-950">
              Group overview
            </h2>
            <p className="mt-5 leading-relaxed text-ink-600">{company.overview}</p>
            <p className="mt-4 leading-relaxed text-ink-600">{company.ownership}</p>
          </div>
        </div>

        <dl className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink-200 bg-ink-200">
          <div className="bg-panel p-6">
            <dt className="text-xs tracking-[0.14em] text-ink-500 uppercase">Registered</dt>
            <dd className="font-display mt-2 text-3xl font-bold text-ink-950 tabular">
              {company.foundedYear}
            </dd>
            <dd className="mt-1 text-sm text-ink-500">in {company.foundedIn}</dd>
          </div>
          <div className="bg-panel p-6">
            <dt className="text-xs tracking-[0.14em] text-ink-500 uppercase">Countries</dt>
            <dd className="font-display mt-2 text-3xl font-bold text-ink-950 tabular">
              {countries.length}
            </dd>
            <dd className="mt-1 text-sm text-ink-500">separately incorporated</dd>
          </div>
          <div className="col-span-2 bg-panel p-6">
            <dt className="text-xs tracking-[0.14em] text-ink-500 uppercase">
              Operating companies
            </dt>
            <dd className="mt-3 space-y-1.5">
              {divisions.map((d) => (
                <span key={d.name} className="block text-sm text-ink-800">
                  {d.name}
                  <span className="text-ink-400"> · {d.country}</span>
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </section>

      <section className="relative isolate overflow-hidden bg-shell py-24 text-shell-fg sm:py-28">
        <Image
          src={photos.mining.src}
          alt={photos.mining.alt}
          fill
          sizes="100vw"
          className="pointer-events-none object-cover opacity-30"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-shell via-shell/80 to-shell/25"
        />
        <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-live-400 uppercase">Reach</p>
          <h2 className="font-display mt-5 max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-5xl">
            Eight countries, one performance benchmark.
          </h2>
        </div>
      </section>

      <section className="border-y border-ink-200 bg-ink-50">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink-950">
            How we expect our people to work
          </h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v) => (
              <div key={v.title} className="bg-panel p-6">
                <h3 className="font-display text-base font-semibold text-ink-950">{v.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-600">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink-950">
          Strategic partners
        </h2>
        <div className="mt-10 space-y-px">
          {partners.map((p) => (
            <article
              key={p.name}
              className="grid gap-4 border-t border-ink-200 py-7 sm:grid-cols-[minmax(0,16rem)_1fr] sm:gap-10"
            >
              <div>
                <h3 className="font-display text-xl font-bold tracking-tight text-ink-950">
                  {p.name}
                </h3>
                <p className="mt-1 text-xs font-semibold tracking-[0.12em] text-live-700 uppercase">
                  {p.role}
                </p>
              </div>
              <p className="leading-relaxed text-ink-600">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      <p className="mx-auto max-w-6xl px-5 pb-10 text-xs text-ink-400 sm:px-8">{IMAGERY_NOTE}</p>
    </>
  )
}
