import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { projects } from '@/lib/company/profile'

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Completed electrical and electro-mechanical projects delivered by HA GROUP.',
}

/**
 * Completed work.
 *
 * Returns a 404 while `projects` is empty rather than publishing a page that
 * says "nothing here yet". An empty portfolio on a contractor's site actively
 * costs credibility; no page at all costs nothing, and the navigation link is
 * hidden by the same condition. Add entries to `projects` and both appear.
 */
export default function ProjectsPage() {
  if (projects.length === 0) notFound()

  return (
    <>
      <header className="border-b border-shell-fg/10 bg-shell text-shell-fg">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <p className="text-xs font-semibold tracking-[0.18em] text-live-400 uppercase">
            Completed work
          </p>
          <h1 className="font-display mt-5 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Plants, lines and substations we have delivered
          </h1>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-16 sm:grid-cols-2 sm:px-8 lg:grid-cols-3">
        {projects.map((p) => (
          <article
            key={p.slug}
            className="group overflow-hidden rounded-2xl border border-ink-200 bg-panel transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
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
              </div>
            ) : null}

            <div className="p-6">
              <p className="text-xs font-semibold tracking-[0.12em] text-live-700 uppercase">
                {p.category} · {p.year}
              </p>
              <h2 className="font-display mt-2 text-lg font-semibold text-ink-950">{p.title}</h2>
              <p className="mt-1 text-sm text-ink-500">
                {p.client} · {p.country}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">{p.summary}</p>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}
