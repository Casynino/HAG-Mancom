import type { Metadata } from 'next'
import Image from 'next/image'
import { Check } from 'lucide-react'
import { services, SOURCE_NOTE, verticals } from '@/lib/company/profile'
import { IMAGERY_NOTE, photos, servicePhotos } from '@/lib/company/imagery'

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
      <header className="relative isolate overflow-hidden border-b border-shell-fg/10 bg-shell text-shell-fg">
        <Image
          src={photos.manufacturing.src}
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
            Capability
          </p>
          <h1 className="font-display mt-5 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            What we design, build, install and keep running
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-shell-fg/70">
            Ten service lines delivered by one accountable contractor, from a single control panel
            to a complete 330 kV substation.
          </p>

          <ul className="mt-10 flex flex-wrap gap-2">
            {verticals.map((v) => (
              <li
                key={v.title}
                className="rounded-full border border-shell-fg/25 px-4 py-1.5 text-sm text-shell-fg/80"
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
        {services.map((s, i) => {
          const photo = servicePhotos[s.slug]
          // Alternate the side the photograph sits on, so ten sections read as
          // a rhythm rather than ten identical rows.
          const imageFirst = i % 2 === 1

          return (
            <section
              key={s.slug}
              id={s.slug}
              className="grid scroll-mt-24 items-center gap-8 border-b border-ink-200 py-16 lg:grid-cols-2 lg:gap-16"
            >
              {photo ? (
                <div
                  className={`group relative aspect-[4/3] overflow-hidden rounded-2xl bg-ink-100 ${
                    imageFirst ? 'lg:order-1' : 'lg:order-2'
                  }`}
                >
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-105"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-shell/50 via-transparent to-transparent"
                  />
                  <span className="absolute bottom-4 left-4 rounded-full bg-shell/70 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-white uppercase backdrop-blur">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
              ) : null}

              <div className={imageFirst ? 'lg:order-2' : 'lg:order-1'}>
                <h2 className="font-display text-3xl font-bold tracking-tight text-ink-950 text-balance">
                  {s.title}
                </h2>
                <p className="mt-4 text-lg leading-relaxed text-ink-600">{s.summary}</p>

                {s.points.length > 0 ? (
                  <ul className="mt-7 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                    {s.points.map((p) => (
                      <li key={p} className="flex gap-2.5 text-sm leading-relaxed text-ink-700">
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-live-600"
                          aria-hidden="true"
                        />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          )
        })}
      </div>

      {/* A full-bleed band, so ten sections do not run into the footer flat. */}
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
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-shell via-shell/80 to-shell/30"
        />
        <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-live-400 uppercase">
            One contractor
          </p>
          <h2 className="font-display mt-5 max-w-3xl text-3xl font-bold tracking-tight text-balance sm:text-5xl">
            From a single control panel to a complete 330 kV substation.
          </h2>
        </div>
      </section>

      <p className="mx-auto max-w-6xl px-5 py-10 text-xs text-ink-400 sm:px-8">
        {SOURCE_NOTE} {IMAGERY_NOTE}
      </p>
    </>
  )
}
