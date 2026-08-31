'use client'

import { useActionState } from 'react'
import { Field, Input, Panel } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { changePasswordAction } from '@/server/auth-actions'

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, null)

  return (
    <Panel className="p-5">
      <form action={formAction} className="space-y-4" noValidate>
        <FormResult state={state} />

        <Field
          label="Current password"
          htmlFor="currentPassword"
          required
          errors={errorsFor(state, 'currentPassword')}
        >
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>

        <Field
          label="New password"
          htmlFor="newPassword"
          hint="At least 12 characters. Longer is stronger than complicated."
          required
          errors={errorsFor(state, 'newPassword')}
        >
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </Field>

        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          required
          errors={errorsFor(state, 'confirmPassword')}
        >
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>

        <SubmitButton size="lg" pendingLabel="Saving…" className="w-full">
          Save password
        </SubmitButton>
      </form>
    </Panel>
  )
}
