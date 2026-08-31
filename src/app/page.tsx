import { redirect } from 'next/navigation'
import { getActor } from '@/lib/authz/guard'
import { defaultRouteFor } from '@/lib/authz/roles'

/** Sends each person to the surface where their work actually is. */
export default async function RootPage() {
  const actor = await getActor()
  if (!actor) redirect('/sign-in')
  if (actor.mustChangePassword) redirect('/change-password')
  redirect(defaultRouteFor(actor.roles))
}
