import type { Metadata } from 'next'
import Image from 'next/image'
import { Check } from 'lucide-react'
import { services, SOURCE_NOTE, verticals } from '@/lib/company/profile'
import { photos } from '@/lib/company/imagery'

export const metadata: Metadata = {
  title: 'Services',
  description:
    'Design, electrical services, construction, hazardous areas, manufacture, installation, ' +
    'maintenance, labour hire and distributorship — HA GROUP’s ten service lines.',
}

/**
 * The services page carries the detail a buyer actually evaluates: voltage
 * classes, panel capacities, certifications. Those specifics are the reason a
 * procurement officer shortlists a contractor, so they are set as scannable
 * lists rather than compressed into prose.
 */
export default function ServicesPage() {
  return (
    <>
      <header className="relative isolate overflow-hidden border-b border-white/10 bg-shell text-white">
        <Image
          src={photos.panel.src}
          alt=""
          fill
          priority
          sizes="100vw"
          className="pointer-events-none object-cover opacity-20"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-shell via-shell/85 to-shell/30"
        />
        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <p className="text-xs font-semibold tracking-[0.18em] text-live-400 uppercase">
            Capability
          </p>
          <h1 className="font-display mt-5 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            What we design, build, install and keep running
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
            Ten service lines delivered by one accountable contractor, from a single control panel
            to a complete 330 kV substation.
          </p>

          <ul className="mt-10 flex flex-wrap gap-2">
            {verticals.map((v) => (
              <li
                key={v.title}
                className="rounded-full border border-white/25 px-4 py-1.5 text-sm text-white/80"
              >
                {v.title}
              </li>
            ))}
          </ul>
        </div>
      </header>

      {/* An index, so a reader can jump straight to the line they came for. */}
      <nav aria-label="Service lines" className="border-b border-ink-200 bg-ink-50">
        <ul className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-5 py-5 sm:px-8">
          {services.map((s) => (
            <li key={s.slug}>
              <a
                href={`#${s.slug}`}
                className="text-sm text-ink-600 underline-offset-4 hover:text-brand-700 hover:underline"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        {services.map((s) => (
          <section
            key={s.slug}
            id={s.slug}
            className="grid scroll-mt-20 gap-6 border-b border-ink-200 py-14 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-16"
          >
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-ink-950">
                {s.title}
              </h2>
              <p className="mt-3 leading-relaxed text-ink-600">{s.summary}</p>
            </div>

            {s.points.length > 0 ? (
              <ul className="grid gap-x-8 gap-y-3 self-start sm:grid-cols-2">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-3 text-sm leading-relaxed text-ink-700">
                    <Check className="mt-0.5 size-4 shrink-0 text-live-600" aria-hidden="true" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <p className="mx-auto max-w-6xl px-5 py-10 text-xs text-ink-400 sm:px-8">{SOURCE_NOTE}</p>
    </>
  )
}
