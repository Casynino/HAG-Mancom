import { redirect } from 'next/navigation'

/** The Administrator's work starts at settings; there is no separate landing page. */
export default function AdminIndex() {
  redirect('/admin/settings')
}
