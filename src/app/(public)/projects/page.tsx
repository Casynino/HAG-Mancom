import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Camera } from 'lucide-react'
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
 * Every entry is HA GROUP's own project register, from their pictorial business
 * profile, with the scope as they contracted it. Each card opens onto the
 * project itself.
 *
 * Contract values are deliberately not shown. The profile states three of them
 * and that profile is a document handed to a prospective client under cover of
 * a conversation; a public page is not the same thing, and what a job was worth
 * is HA GROUP's to disclose deal by deal. They asked for them off, and the
 * field has been removed from the model rather than merely hidden — a field
 * that still exists is one somebody renders again by accident.
 *
 * The photographs are theirs. This page carries no stock imagery at all, which
 * is the whole point of it: a contractor's portfolio showing somebody else's
 * site is an argument against hiring them.
 */
export default function ProjectsPage() {
  if (projects.length === 0) notFound()

  const countries = [...new Set(projects.flatMap((p) => p.country.split(/,| and /)))]
    .map((c) => c.trim())
    .filter(Boolean)
  const photographs = new Set(projects.flatMap((p) => p.images)).size

  return (
    <>
      <header className="relative isolate overflow-hidden border-b border-shell-fg/10 bg-shell text-shell-fg">
        <Image
          src={hagPhotos.cableReticulation.src}
          alt=""
          fill
          priority
          sizes="100vw"
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
            Named clients and the scope as it was contracted. Open any one to see the work.
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
              <dt className="text-xs tracking-[0.14em] text-shell-fg/45 uppercase">Photographs</dt>
              <dd className="font-display mt-1 text-3xl font-bold tabular">{photographs}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.slug}
              href={`/projects/${p.slug}`}
              className="group flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-panel transition-all duration-300 hover:-translate-y-1 hover:border-ink-300 hover:shadow-xl"
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
                  {p.images.length > 1 ? (
                    <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-sidebar/80 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                      <Camera className="size-3" aria-hidden="true" />
                      {p.images.length}
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
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-600">
                  {p.summary}
                </p>

                <span className="mt-4 inline-flex items-center gap-1.5 border-t border-ink-100 pt-4 text-sm font-medium text-brand-700">
                  See the work
                  <ArrowRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </Link>
          ))}
        </div>

        <p className="mt-12 max-w-3xl text-xs leading-relaxed text-ink-400">
          {PROJECTS_SOURCE} Client contact details and contract values printed in that profile are
          deliberately not reproduced here.
        </p>
      </div>
    </>
  )
}
