import Link from 'next/link'
import { company, offices } from '@/lib/company/profile'

/**
 * The footer carries the head office and the group's reach, because those are
 * the two things a prospective client checks before making contact. Every
 * office is on the contact page; repeating all nine here would bury the email
 * address that actually starts a conversation.
 */
export function SiteFooter() {
  const head = offices.find((o) => o.isHeadOffice)

  return (
    <footer className="border-t border-white/10 bg-shell text-white/60">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="font-display text-lg font-bold tracking-tight text-white">HA GROUP</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed">{company.tagline}.</p>
            <p className="mt-4 text-sm">
              <a
                href={`mailto:${company.primaryEmail}`}
                className="text-live-300 underline-offset-4 hover:underline"
              >
                {company.primaryEmail}
              </a>
            </p>
          </div>

          {head ? (
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-white/40 uppercase">
                Head office
              </p>
              <address className="mt-3 text-sm leading-relaxed not-italic">
                {head.address}
                <br />
                {head.country}
              </address>
              <p className="mt-2 text-sm tabular">
                {head.phones.map((p) => (
                  <a
                    key={p}
                    href={`tel:${p.replace(/\s/g, '')}`}
                    className="block hover:text-white"
                  >
                    {p}
                  </a>
                ))}
              </p>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-white/40 uppercase">
              Navigate
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/services" className="hover:text-white">
                  Services
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-white">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white">
                  Contact
                </Link>
              </li>
              <li className="pt-2">
                <Link href="/sign-in" className="text-live-300 hover:underline">
                  Staff login
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} HA GROUP. Incorporated under the Companies Act of each
            country in which it operates.
          </p>
          <p className="text-white/40">
            Registered in {company.foundedIn}, {company.foundedYear}.
          </p>
        </div>
      </div>
    </footer>
  )
}
