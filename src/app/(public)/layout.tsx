import { getActor } from '@/lib/authz/guard'
import { SiteHeader } from '@/components/public/site-header'
import { SiteFooter } from '@/components/public/site-footer'

/**
 * The public shell.
 *
 * Deliberately outside the (app) group: none of these pages touch a session,
 * a permission or a company record, so none of them can leak one. The single
 * piece of session awareness is whether a cookie resolves at all, which decides
 * whether the header offers "Staff login" or "Go to portal".
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()

  return (
    <div className="font-body flex min-h-dvh flex-col bg-panel">
      <SiteHeader signedIn={Boolean(actor)} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
