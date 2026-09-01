import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { projects, PROJECTS_SOURCE } from '@/lib/company/profile'
import { hagPhotos } from '@/lib/company/imagery'

export const metadata: Metadata = {
  title: 'Projects',
  description:
    'Substations, transmission lines, street lighting and plant installations delivered by ' +
    'HA GROUP across Zimbabwe, Malawi and Tanzania.',
}

/**
 * Completed work.
 *
 * Every entry here is HA GROUP's own project register, taken from their
 * pictorial business profile, with the scope as they list it and the contract
 * value where they state one. Where they state no value the field is simply
 * absent — a project reference with an invented figure in it is worse than no
 * reference at all, because the one thing a prospective client checks is the
 * number.
 *
 * The photographs are theirs too. This page carries no stock imagery, which is
 * the whole point of it: a contractor's portfolio showing somebody else's site
 * is an argument against hiring them.
 */
export default function ProjectsPage() {
  if (projects.length === 0) notFound()

  const withValue = projects.filter((p) => p.value)
  const countries = [...new Set(projects.flatMap((p) => p.country.split(/,| and /)))]
    .map((c) => c.trim())
    .filter(Boolean)

  return (
    <>
      {/*
       * A daylight photograph, and the shared hero treatment.
       *
       * The night street-lighting shot went here first and was wrong twice: at
       * hero scale a dark road reads as near-black, and forcing the header dark
       * to suit it made the site navigation — which is transparent and takes
       * its colour from the theme — invisible on the light theme. The night
       * shot belongs on the Blantyre card, where it is the subject rather than
       * a backdrop.
       */}
      <header className="relative isolate overflow-hidden border-b border-shell-fg/10 bg-shell text-shell-fg">
        <Image
          src={hagPhotos.cableReticulation.src}
          alt=""
          fill
          priority
          sizes="100vw"
          /* Biased right so the cable bank falls where the scrim is thinnest.
             Centred, the crop put a pale concrete column under the clear part
             of the gradient and the hero read as empty. */
          className="pointer-events-none object-cover object-[75%_center]"
          style={{ opacity: 'var(--hero-photo-opacity)' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'var(--hero-scrim)' }}
        />
        <div className="relative mx-auto max-w-6xl px-5 pt-28 pb-16 sm:px-8 sm:pt-32 sm:pb-20">
          <p className="text-xs font-semibold tracking-[0.18em] text-live-400 uppercase">
            Completed work
          </p>
          <h1 className="font-display mt-5 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Substations, lines and plants we have delivered
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-shell-fg/70">
            Named clients, the scope as it was contracted, and the value where it is ours to state.
            Every photograph on this page is of our own work.
          </p>

          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <dt className="text-xs tracking-[0.14em] text-shell-fg/45 uppercase">Projects</dt>
              <dd className="font-display mt-1 text-3xl font-bold tabular">{projects.length}</dd>
            </div>
            <div>
              <dt className="text-xs tracking-[0.14em] text-shell-fg/45 uppercase">Countries</dt>
              <dd className="font-display mt-1 text-3xl font-bold tabular">{countries.length}</dd>
            </div>
            <div>
              <dt className="text-xs tracking-[0.14em] text-shell-fg/45 uppercase">
                Contract values stated
              </dt>
              <dd className="font-display mt-1 text-3xl font-bold tabular">{withValue.length}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <article
              key={p.slug}
              className="group flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-panel transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              {p.images[0] ? (
                <div className="relative aspect-[4/3] overflow-hidden bg-ink-100">
                  <Image
                    src={p.images[0]}
                    alt={`${p.title} — ${p.client}, ${p.country}`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {p.value ? (
                    <span className="absolute top-3 left-3 rounded-full bg-sidebar/85 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur tabular">
                      {p.value}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-1 flex-col p-6">
                <p className="text-xs font-semibold tracking-[0.12em] text-live-700 uppercase">
                  {p.category} · {p.period}
                </p>
                <h2 className="font-display mt-2 text-lg leading-snug font-semibold text-ink-950">
                  {p.title}
                </h2>
                <p className="mt-1.5 text-sm font-medium text-ink-700">{p.client}</p>
                <p className="text-sm text-ink-500">{p.country}</p>
                <p className="mt-3 text-sm leading-relaxed text-ink-600">{p.summary}</p>

                {/* The scope, as contracted. This is what a prospective client
                    is actually reading the page for. */}
                <ul className="mt-4 space-y-1.5 border-t border-ink-100 pt-4">
                  {p.scope.map((line) => (
                    <li key={line} className="flex gap-2 text-sm leading-relaxed text-ink-600">
                      <span
                        className="mt-2 size-1 shrink-0 rounded-full bg-live-600"
                        aria-hidden="true"
                      />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-12 max-w-3xl text-xs leading-relaxed text-ink-400">
          {PROJECTS_SOURCE} Client contact details printed in that profile are deliberately not
          reproduced here.
        </p>
      </div>
    </>
  )
}
