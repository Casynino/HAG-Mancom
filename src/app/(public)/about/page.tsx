import type { Metadata } from 'next'
import { company, countries, divisions, partners, values } from '@/lib/company/profile'

export const metadata: Metadata = {
  title: 'About',
  description:
    'HA GROUP is a turnkey electrical projects company registered in Zimbabwe in 2007 and ' +
    'incorporated across eight countries in Africa and the United Kingdom.',
}

export default function AboutPage() {
  return (
    <>
      <header className="border-b border-white/10 bg-shell text-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <p className="text-xs font-semibold tracking-[0.18em] text-live-400 uppercase">
            Who we are
          </p>
          <h1 className="font-display mt-5 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            {company.benchmark.split('.')[0]}.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
            {company.benchmark.split('.').slice(1).join('.').trim()}
          </p>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink-950">
            Group overview
          </h2>
          <p className="mt-5 leading-relaxed text-ink-600">{company.overview}</p>
          <p className="mt-4 leading-relaxed text-ink-600">{company.ownership}</p>
        </div>

        <dl className="grid grid-cols-2 gap-px self-start overflow-hidden rounded border border-ink-200 bg-ink-200">
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

      <section className="border-y border-ink-200 bg-ink-50">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink-950">
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
    </>
  )
}
