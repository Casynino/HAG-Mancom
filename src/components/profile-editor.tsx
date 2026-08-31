'use client'

import { useActionState } from 'react'
import { Lock, UserCog } from 'lucide-react'
import { Badge, Field, Input, Notice, Panel, PanelHeader, SectionBar } from '@/components/ui'
import { PasswordInput } from '@/components/password-input'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { updateOwnProfileAction } from '@/server/profile-actions'
import { changePasswordAction } from '@/server/auth-actions'

/**
 * The two things a person can change about themselves, side by side.
 *
 * Details and password are separate forms rather than one, because they fail
 * differently: a mistyped phone number should not lose a correctly typed
 * password, and a wrong current password should not discard a name edit.
 */
export function ProfileEditor({
  fullName,
  phone,
  jobTitle,
  email,
  roles,
}: {
  fullName: string
  phone: string | null
  jobTitle: string | null
  email: string
  roles: string[]
}) {
  const [detailState, detailAction] = useActionState(updateOwnProfileAction, null)
  const [passwordState, passwordAction] = useActionState(changePasswordAction, null)

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <PanelHeader
          title="Your details"
          description="How you appear to colleagues and on the documents you prepare."
        />
        <form action={detailAction} className="space-y-4 p-4 sm:p-5" noValidate>
          <FormResult state={detailState} />

          <Field
            label="Full name"
            htmlFor="fullName"
            required
            hint="Written as colleagues would write it — this prints beside your decisions."
            errors={errorsFor(detailState, 'fullName')}
          >
            <Input id="fullName" name="fullName" defaultValue={fullName} required maxLength={120} />
          </Field>

          <Field
            label="Job title"
            htmlFor="jobTitle"
            hint="Optional. e.g. Senior Technical Officer."
            errors={errorsFor(detailState, 'jobTitle')}
          >
            <Input id="jobTitle" name="jobTitle" defaultValue={jobTitle ?? ''} maxLength={120} />
          </Field>

          <Field
            label="Phone"
            htmlFor="phone"
            hint="Optional. How site reaches you."
            errors={errorsFor(detailState, 'phone')}
          >
            <Input id="phone" name="phone" type="tel" defaultValue={phone ?? ''} maxLength={26} />
          </Field>

          {/* Shown, and not editable. Both are answers to questions people ask
              constantly, and neither is theirs to change. */}
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-3.5">
            <p className="text-xs font-semibold tracking-[0.12em] text-ink-500 uppercase">
              Not yours to change
            </p>
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <dt className="text-ink-500">Email</dt>
                <dd className="font-medium break-all text-ink-900">{email}</dd>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <dt className="text-ink-500">Roles</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {roles.map((r) => (
                    <Badge key={r} tone="brand">
                      {r}
                    </Badge>
                  ))}
                </dd>
              </div>
            </dl>
            <p className="mt-2.5 text-xs leading-relaxed text-ink-500">
              Your email is the identity every audit entry, session and approval is attributed to,
              and your roles decide what you can reach. An Administrator changes both, in People and
              roles, and the change is recorded.
            </p>
          </div>

          <SubmitButton pendingLabel="Saving…">
            <UserCog className="size-4" aria-hidden="true" />
            Save my details
          </SubmitButton>
        </form>
      </Panel>

      <Panel>
        <PanelHeader
          title="Change your password"
          description="You will be signed out of this device and asked to sign in again."
        />
        <form action={passwordAction} className="space-y-4 p-4 sm:p-5" noValidate>
          <FormResult state={passwordState} />

          <Field
            label="Current password"
            htmlFor="currentPassword"
            required
            errors={errorsFor(passwordState, 'currentPassword')}
          >
            <PasswordInput
              id="currentPassword"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
          </Field>

          <Field
            label="New password"
            htmlFor="newPassword"
            required
            hint="At least 12 characters. Longer beats complicated."
            errors={errorsFor(passwordState, 'newPassword')}
          >
            <PasswordInput
              id="newPassword"
              name="newPassword"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </Field>

          <Field
            label="Confirm new password"
            htmlFor="confirmPassword"
            required
            errors={errorsFor(passwordState, 'confirmPassword')}
          >
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              required
            />
          </Field>

          <Notice tone="neutral" title="Nobody here can read your password">
            It is stored only as a hash. An Administrator can reset it, which forces you to set a
            new one on your next sign-in — they cannot see or choose what it becomes.
          </Notice>

          <SubmitButton pendingLabel="Changing…">
            <Lock className="size-4" aria-hidden="true" />
            Change password
          </SubmitButton>
        </form>
      </Panel>
    </div>
  )
}
