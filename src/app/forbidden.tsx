import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'

/**
 * Rendered with a 403 when a guard refuses.
 *
 * Deliberately says what happened and where to go, rather than "access denied".
 * It does not name the resource or say whether it exists — that would turn a
 * refusal into a way of discovering what is there.
 */
export default function Forbidden() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <p className="text-xs font-semibold tracking-[0.18em] text-brand-600 uppercase">
          HA GROUP TZ LTD
        </p>

        <div className="mt-4 flex gap-3 rounded border border-ink-200 bg-panel p-5">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn-600" aria-hidden="true" />
          <div className="min-w-0 space-y-3">
            <h1 className="text-lg font-semibold text-ink-900">
              That section is not open to your role
            </h1>
            <p className="text-sm text-ink-600">
              Permissions are set by your administrator and are not something you can change
              yourself. If you need access to this part of the platform, ask them to grant the role.
            </p>
            <Link
              href="/"
              className="tap inline-flex items-center btn-primary rounded-lg px-4 text-sm font-medium text-white"
            >
              Back to your work
            </Link>
          </div>
        </div>

        <p className="mt-6 text-xs text-ink-400">
          This attempt has been recorded, as every action in the platform is.
        </p>
      </div>
    </main>
  )
}
