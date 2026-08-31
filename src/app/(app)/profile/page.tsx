import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import { Fingerprint, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { profiles } from '@/db/schema'
import { ProfileEditor } from '@/components/profile-editor'
import { MetricCard, PageHeader, SectionBar } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { ROLE_LABELS } from '@/lib/authz/roles'
import { formatDate, relativeTime } from '@/lib/display'

export const metadata: Metadata = { title: 'My profile' }

/**
 * A person's own record.
 *
 * Every role reaches this — it is the one page in the platform that is not
 * about the company's work but about the person doing it. What can be changed
 * here is narrow on purpose: the name that prints beside their decisions, a
 * phone number, a job title, and their password. Not the email, which is the
 * identity every audit row is attributed to; not their roles, which are an
 * Administrator's to grant.
 *
 * The roles are shown read-only anyway, because "why can I not see that page"
 * is the most common question a platform like this produces, and the answer is
 * always here.
 */
export default async function ProfilePage() {
  const data = await pageContext(async (db, actor) => {
    const [me] = await db
      .select({
        id: profiles.id,
        email: profiles.email,
        fullName: profiles.fullName,
        phone: profiles.phone,
        jobTitle: profiles.jobTitle,
        lastLoginAt: profiles.lastLoginAt,
        passwordChangedAt: profiles.passwordChangedAt,
        mustChangePassword: profiles.mustChangePassword,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .where(eq(profiles.id, actor.id))
      .limit(1)

    return { me: me!, roles: actor.roles.map((r) => ROLE_LABELS[r]) }
  })

  const { me } = data

  return (
    <>
      <PageHeader
        eyebrow="Your account"
        title={me.fullName}
        description={me.jobTitle ?? 'Your details, and the password you sign in with.'}
        stats={[
          { label: data.roles.length === 1 ? 'role' : 'roles', value: data.roles.length },
          {
            label: 'with HA GROUP since',
            value: <span className="text-base">{formatDate(me.createdAt.toISOString())}</span>,
          },
        ]}
      />

      <SectionBar
        label="Who you are here"
        scope="Shown beside every decision you make and every document you prepare"
        tone="brand"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          index={0}
          label="Signed in as"
          value={<span className="text-base break-all">{me.email}</span>}
          note="your identity in the audit trail — an Administrator changes this, not you"
          icon={<Mail className="size-4" aria-hidden="true" />}
          tone="brand"
        />
        <MetricCard
          index={1}
          label="Roles held"
          value={data.roles.length}
          note={data.roles.join(' · ')}
          icon={<ShieldCheck className="size-4" aria-hidden="true" />}
          tone="ok"
        />
        <MetricCard
          index={2}
          label="Password set"
          value={
            <span className="text-base">
              {me.passwordChangedAt ? relativeTime(me.passwordChangedAt) : 'never changed'}
            </span>
          }
          note={me.mustChangePassword ? 'you must change it before continuing' : 'change it below'}
          icon={<KeyRound className="size-4" aria-hidden="true" />}
          tone={me.mustChangePassword ? 'warn' : 'neutral'}
        />
        <MetricCard
          index={3}
          label="Last signed in"
          value={
            <span className="text-base">
              {me.lastLoginAt ? relativeTime(me.lastLoginAt) : 'this is your first visit'}
            </span>
          }
          note="if this was not you, change your password now"
          icon={<Fingerprint className="size-4" aria-hidden="true" />}
        />
      </div>

      <SectionBar
        label="Change your details"
        scope="Your name prints on the documents you prepare, so keep it as colleagues would write it"
        tone="live"
      />

      <ProfileEditor
        fullName={me.fullName}
        phone={me.phone}
        jobTitle={me.jobTitle}
        email={me.email}
        roles={data.roles}
      />
    </>
  )
}
