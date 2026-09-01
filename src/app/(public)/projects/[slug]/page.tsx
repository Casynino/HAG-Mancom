import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Building2, CalendarDays, MapPin } from 'lucide-react'
import { projects, PROJECTS_SOURCE, partners } from '@/lib/company/profile'
import { hagPhotos } from '@/lib/company/imagery'

/**
 * One project.
 *
 * The scope is the substance of this page. A prospective client reading a
 * contractor's portfolio is not looking for adjectives — they are checking
 * whether the work resembles their own, so the contracted scope is listed in
 * full, exactly as HA GROUP wrote it, and the photographs are of that work.
 *
 * Generated statically for every entry, so there is nothing to look up at
 * request time and a link into it can be shared.
 */

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const project = projects.find((p) => p.slug === slug)
  if (!project) return { title: 'Project' }

  return {
    title: project.title,
    description: `${project.client}, ${project.country}. ${project.summary}`,
    openGraph: {
      title: `${project.title} — HA GROUP`,
      description: project.summary,
      images: project.images[0] ? [{ url: project.images[0] }] : undefined,
    },
  }
}

/*
 * Caption lookup by path. Typed as plain strings because a project's images are
 * strings — the const assertion on hagPhotos narrows its keys to literals, and
 * a Map keyed on those literals cannot be queried with an arbitrary path.
 */
const ALT = new Map<string, string>(
  Object.values(hagPhotos).map((photo) => [photo.src as string, photo.alt as string]),
)

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const project = projects.find((p) => p.slug === slug)
  if (!project) notFound()

  const index = projects.findIndex((p) => p.slug === slug)
  const others = projects.filter((p) => p.slug !== slug).slice(0, 3)
  const next = projects[(index + 1) % projects.length]!
  const hero = project.images[0]
  const rest = project.images.slice(1)

  return (
    <>
      <header className="relative isolate overflow-hidden border-b border-shell-fg/10 bg-shell text-shell-fg">
        {hero ? (
          <Image
            src={hero}
            alt=""
            fill
            priority
            sizes="100vw"
            className="pointer-events-none object-cover"
            style={{ opacity: 'var(--hero-photo-opacity)' }}
          />
        ) : null}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'var(--hero-scrim)' }}
        />

        <div className="relative mx-auto max-w-5xl px-5 pt-28 pb-16 sm:px-8 sm:pt-32 sm:pb-20">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-shell-fg/60 transition-colors hover:text-shell-fg"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            All projects
          </Link>

          <p className="mt-8 text-xs font-semibold tracking-[0.18em] text-live-400 uppercase">
            {project.category}
          </p>
          <h1 className="font-display mt-4 max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-5xl">
            {project.title}
          </h1>

          <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-4 text-sm">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 shrink-0 text-shell-fg/40" aria-hidden="true" />
              <dt className="sr-only">Client</dt>
              <dd className="font-medium">{project.client}</dd>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-shell-fg/40" aria-hidden="true" />
              <dt className="sr-only">Country</dt>
              <dd className="text-shell-fg/70">{project.country}</dd>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-shell-fg/40" aria-hidden="true" />
              <dt className="sr-only">Period</dt>
              <dd className="text-shell-fg/70">{project.period}</dd>
            </div>
          </dl>
        </div>
      </header>

      <article className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
        <p className="max-w-3xl text-xl leading-relaxed text-ink-700">{project.summary}</p>

        {/* The scope, verbatim. This is what the page exists for. */}
        <section className="mt-14">
          <h2 className="flex items-center gap-3 text-xs font-semibold tracking-[0.18em] text-live-700 uppercase">
            <span className="h-px w-8 bg-live-600" aria-hidden="true" />
            What we did
          </h2>
          <ul className="mt-6 grid gap-x-10 gap-y-3 sm:grid-cols-2">
            {project.scope.map((line) => (
              <li key={line} className="flex gap-3 text-[15px] leading-relaxed text-ink-700">
                <span
                  className="mt-2.5 size-1.5 shrink-0 rounded-full bg-live-600"
                  aria-hidden="true"
                />
                {line}
              </li>
            ))}
          </ul>
        </section>

        {rest.length > 0 ? (
          <section className="mt-16">
            <h2 className="flex items-center gap-3 text-xs font-semibold tracking-[0.18em] text-live-700 uppercase">
              <span className="h-px w-8 bg-live-600" aria-hidden="true" />
              On site
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {rest.map((src, i) => (
                <figure
                  key={src}
                  className={`overflow-hidden rounded-2xl border border-ink-200 bg-ink-100 ${
                    rest.length % 2 === 1 && i === 0 ? 'sm:col-span-2' : ''
                  }`}
                >
                  <div
                    className={`relative ${
                      rest.length % 2 === 1 && i === 0 ? 'aspect-[16/9]' : 'aspect-[4/3]'
                    }`}
                  >
                    <Image
                      src={src}
                      alt={ALT.get(src) ?? `${project.title} — ${project.client}`}
                      fill
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover"
                    />
                  </div>
                  <figcaption className="px-4 py-3 text-sm leading-relaxed text-ink-500">
                    {ALT.get(src) ?? project.title}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-16 rounded-2xl border border-ink-200 bg-ink-50 p-6 sm:p-8">
          <h2 className="font-display text-lg font-semibold text-ink-950">
            Work of this kind for your plant
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
            We represent {partners.map((p) => p.name).join(', ')} across the region, and carry the
            same scope from design through to commissioning and follow-up maintenance.
          </p>
          <Link
            href="/contact"
            className="tap btn-primary mt-5 inline-flex items-center gap-2 rounded-lg px-5 text-sm font-medium"
          >
            Talk to an engineer
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>

        <nav className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-ink-200 pt-8">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All projects
          </Link>
          <Link
            href={`/projects/${next.slug}`}
            className="inline-flex items-center gap-1.5 text-right text-sm font-medium text-brand-700 hover:underline"
          >
            {next.title}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </nav>

        <p className="mt-10 text-xs leading-relaxed text-ink-400">{PROJECTS_SOURCE}</p>
      </article>

      {others.length > 0 ? (
        <section className="border-t border-ink-200 bg-ink-50">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <h2 className="text-xs font-semibold tracking-[0.18em] text-ink-500 uppercase">
              Other work
            </h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              {others.map((o) => (
                <Link
                  key={o.slug}
                  href={`/projects/${o.slug}`}
                  className="group overflow-hidden rounded-xl border border-ink-200 bg-panel transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  {o.images[0] ? (
                    <div className="relative aspect-[16/10] overflow-hidden bg-ink-100">
                      <Image
                        src={o.images[0]}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 100vw, 33vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  ) : null}
                  <div className="p-4">
                    <p className="font-display text-sm leading-snug font-semibold text-ink-950">
                      {o.title}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">{o.client}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}
