import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { GridCanvas } from '@/components/public/grid-canvas'
import { NetworkMap } from '@/components/public/network-map'
import { Counter, Reveal } from '@/components/public/motion'
import { IMAGERY_NOTE, photos } from '@/lib/company/imagery'
import {
  company,
  countries,
  greenGrowth,
  partners,
  services,
  verticals,
} from '@/lib/company/profile'

/**
 * The public home page.
 *
 * The visual language is drawn, not photographed. HA GROUP publishes no
 * photographs of its own completed work — its current site uses stock imagery —
 * and putting a stranger's substation on a contractor's website is a claim the
 * company cannot stand behind if a client asks about it. So the imagery here is
 * generated from what is true: a live power network in the hero, and the real
 * coordinates of the nine offices in the map. Both are specific to this
 * business in a way a stock photograph never is.
 *
 * Every figure comes from src/lib/company/profile.ts, which is HA GROUP's own
 * published information.
 */

const VERTICAL_PHOTOS: Record<string, { src: string; alt: string }> = {
  Mining: photos.mining,
  Manufacturing: photos.manufacturing,
  'Agro-processing': photos.transmission,
}

const PARTNER_MARKS = [
  { src: '/brand/sew-eurodrive.png', alt: 'SEW Eurodrive' },
  { src: '/brand/optibelt.jpg', alt: 'Optibelt' },
]

export default function HomePage() {
  const years = new Date().getFullYear() - company.foundedYear

  return (
    <>
      {/* ------------------------------ Hero ------------------------------ */}
      <section className="relative isolate overflow-hidden bg-shell text-shell-fg">
        {/* A photographic ground, heavily darkened. It carries the subject —
            high-voltage transmission — without competing with the type, and the
            live network is drawn on top of it. */}
        <Image
          src={photos.pylons.src}
          alt=""
          fill
          priority
          sizes="100vw"
          className="pointer-events-none object-cover opacity-30"
        />
        <GridCanvas className="absolute inset-0 z-10 size-full" />

        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-52 -right-40 size-[44rem] rounded-full bg-brand-600/25 blur-[120px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-64 -left-40 size-[38rem] rounded-full bg-live-600/10 blur-[120px]"
        />
        {/*
          A scrim under the copy. The network is deliberately busy, and busy is
          fine as atmosphere but not behind 17px body text — this darkens the
          left two-thirds just enough that the type sits on a calm ground while
          the network still reads at the edges.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-r from-shell via-shell/75 to-shell/20"
        />
        {/* Fades the network into the section below rather than cutting it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-40 bg-gradient-to-b from-transparent to-shell"
        />

        <div className="relative z-30 mx-auto max-w-6xl px-5 pt-36 pb-28 sm:px-8 sm:pt-44 sm:pb-36">
          <Reveal>
            <h1 className="font-display max-w-4xl text-[2.6rem] leading-[1.02] font-bold tracking-tight text-balance sm:text-6xl lg:text-[4.6rem]">
              We build the power that keeps industry{' '}
              <span className="bg-gradient-to-r from-live-300 to-live-400 bg-clip-text text-transparent">
                running
              </span>
              .
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-shell-fg/65 sm:text-xl">
              {company.overview}
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/services"
                className="group inline-flex h-13 items-center gap-2 rounded-full bg-shell-fg px-7 font-medium text-shell transition-colors hover:bg-live-300"
              >
                What we do
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
              <Link
                href="/contact"
                className="inline-flex h-13 items-center gap-2 rounded-full border border-shell-fg/25 px-7 font-medium text-shell-fg backdrop-blur transition-colors hover:border-shell-fg/60 hover:bg-shell-fg/5"
              >
                Talk to an engineer
              </Link>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <dl className="mt-24 grid max-w-3xl grid-cols-3 gap-8 border-t border-shell-fg/15 pt-10">
              {[
                {
                  to: countries.length,
                  suffix: '',
                  label: 'countries incorporated',
                },
                { to: services.length, suffix: '', label: 'service lines' },
                { to: years, suffix: '', label: 'years operating' },
              ].map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <span className="font-display block text-5xl font-bold sm:text-6xl">
                      <Counter to={s.to} suffix={s.suffix} />
                    </span>
                    <span className="mt-2 block text-xs leading-snug text-shell-fg/45">
                      {s.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* --------------------------- Partner strip ------------------------ */}
      <section className="border-y border-ink-200 bg-ink-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-5 py-10 sm:flex-row sm:justify-between sm:px-8">
          <p className="text-xs font-semibold tracking-[0.16em] text-ink-500 uppercase">
            Principals we represent
          </p>
          <div className="flex items-center gap-10">
            {PARTNER_MARKS.map((m) => (
              <Image
                key={m.src}
                src={m.src}
                alt={m.alt}
                width={120}
                height={44}
                className="h-9 w-auto opacity-60 mix-blend-multiply grayscale transition hover:opacity-100 hover:grayscale-0 dark:mix-blend-normal"
              />
            ))}
            <span className="font-display text-lg font-semibold text-ink-400">OPP</span>
          </div>
        </div>
      </section>

      {/* --------------------------- Verticals ---------------------------- */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <Reveal>
          <SectionLabel>Industry verticals</SectionLabel>
          <h2 className="font-display mt-5 max-w-2xl text-3xl font-bold tracking-tight text-ink-950 text-balance sm:text-5xl">
            Environments where failure is expensive
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          {verticals.map((v, i) => {
            const photo = VERTICAL_PHOTOS[v.title]
            return (
              <Reveal key={v.title} delay={i * 90}>
                <article className="group h-full overflow-hidden rounded-2xl border border-ink-200 bg-panel transition-all duration-300 hover:-translate-y-1 hover:border-brand-300 hover:shadow-xl hover:shadow-brand-600/5">
                  {photo ? (
                    <div className="relative aspect-[16/10] overflow-hidden bg-ink-100">
                      <Image
                        src={photo.src}
                        alt={photo.alt}
                        fill
                        sizes="(max-width: 640px) 100vw, 33vw"
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-t from-shell/70 to-transparent"
                      />
                    </div>
                  ) : null}
                  <div className="p-7">
                    <h3 className="font-display text-xl font-semibold text-ink-950">{v.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-ink-600">{v.body}</p>
                  </div>
                </article>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* ---------------------------- Services ---------------------------- */}
      <section className="relative overflow-hidden border-y border-ink-200 bg-ink-50">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <SectionLabel>Capability</SectionLabel>
                <h2 className="font-display mt-5 max-w-2xl text-3xl font-bold tracking-tight text-ink-950 text-balance sm:text-5xl">
                  Ten service lines, one accountable contractor
                </h2>
              </div>
              <Link
                href="/services"
                className="group inline-flex items-center gap-2 text-sm font-medium text-brand-700"
              >
                Full detail on every line
                <ArrowUpRight
                  className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </div>
          </Reveal>

          <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s, i) => (
              <li key={s.slug}>
                <Reveal delay={(i % 3) * 70}>
                  <Link
                    href={`/services#${s.slug}`}
                    className="group flex h-full flex-col rounded-xl border border-ink-200 bg-panel p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-live-400/60 hover:shadow-lg"
                  >
                    <span className="font-display flex items-start justify-between gap-3 text-base font-semibold text-ink-950">
                      {s.title}
                      <ArrowRight
                        className="mt-0.5 size-4 shrink-0 text-ink-300 transition-all group-hover:translate-x-1 group-hover:text-live-600"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-2.5 text-sm leading-relaxed text-ink-500">{s.summary}</span>
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------- Partners ---------------------------- */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <Reveal>
          <SectionLabel>Distribution</SectionLabel>
          <h2 className="font-display mt-5 max-w-2xl text-3xl font-bold tracking-tight text-ink-950 text-balance sm:text-5xl">
            Equipment we can stand behind
          </h2>
          <p className="mt-5 max-w-2xl text-lg text-ink-600">
            Each of these is a specific commercial arrangement covering named territories — not a
            logo on a wall.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {partners.map((p, i) => (
            <Reveal key={p.name} delay={i * 90} className="h-full">
              <article className="flex h-full flex-col rounded-2xl border border-ink-200 bg-panel p-8">
                <h3 className="font-display text-xl font-bold tracking-tight text-ink-950">
                  {p.name}
                </h3>
                <p className="mt-2 inline-flex w-fit rounded-full bg-live-600/10 px-3 py-1 text-xs font-semibold tracking-[0.1em] text-live-700 uppercase">
                  {p.role}
                </p>
                <p className="mt-5 text-sm leading-relaxed text-ink-600">{p.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* --------------------------- Green growth ------------------------- */}
      <section className="relative isolate overflow-hidden border-y border-shell-fg/10 bg-shell text-shell-fg">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
        <Image
          src={photos.solar.src}
          alt={photos.solar.alt}
          fill
          sizes="100vw"
          className="pointer-events-none object-cover opacity-20"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-shell via-shell/80 to-shell/40"
        />

        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-24 sm:px-8 sm:py-28 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="text-xs font-semibold tracking-[0.18em] text-live-400 uppercase">
              {greenGrowth.title}
            </p>
            <h2 className="font-display mt-5 text-3xl font-bold tracking-tight text-balance sm:text-5xl">
              {greenGrowth.headline}
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="text-lg leading-relaxed text-shell-fg/65">{greenGrowth.body}</p>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------- Network ---------------------------- */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <Reveal>
            <SectionLabel>Network</SectionLabel>
            <h2 className="font-display mt-5 text-3xl font-bold tracking-tight text-ink-950 text-balance sm:text-5xl">
              Incorporated where we work
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-600">{company.ownership}</p>

            <ul className="mt-8 flex flex-wrap gap-2">
              {countries.map((c) => (
                <li
                  key={c}
                  className="rounded-full border border-ink-300 px-4 py-1.5 text-sm text-ink-700"
                >
                  {c}
                </li>
              ))}
            </ul>

            <Link
              href="/contact"
              className="group mt-8 inline-flex items-center gap-2 text-sm font-medium text-brand-700"
            >
              Every office, with direct numbers
              <ArrowUpRight
                className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </Reveal>

          <Reveal delay={120}>
            <NetworkMap />
          </Reveal>
        </div>
      </section>

      {/* ------------------------------- CTA ------------------------------ */}
      <section className="border-t border-ink-200 bg-ink-50">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-20 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink-950 text-balance sm:text-3xl">
              Have a plant, a line or a substation to discuss?
            </h2>
            <p className="mt-3 max-w-xl text-ink-600">
              Tell us the load, the site and the timeline. We will tell you honestly whether it is
              work we should be doing.
            </p>
          </div>
          <a
            href={`mailto:${company.primaryEmail}`}
            className="group inline-flex h-13 shrink-0 items-center gap-2 rounded-full bg-brand-600 px-7 font-medium text-shell-fg transition-colors"
          >
            {company.primaryEmail}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </a>
        </div>
      </section>

      <ImageryNote />
    </>
  )
}

function ImageryNote() {
  return <p className="mx-auto max-w-6xl px-5 pb-10 text-xs text-ink-400 sm:px-8">{IMAGERY_NOTE}</p>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-xs font-semibold tracking-[0.18em] text-live-700 uppercase">
      <span className="h-px w-8 bg-live-600" aria-hidden="true" />
      {children}
    </p>
  )
}
