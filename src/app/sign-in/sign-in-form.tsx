'use client'

import { useActionState } from 'react'
import { Field, Input, Panel } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { signInAction } from '@/server/auth-actions'

export function SignInForm() {
  const [state, formAction] = useActionState(signInAction, null)

  return (
    <Panel className="p-5">
      <form action={formAction} className="space-y-4" noValidate>
        <FormResult state={state} />

        <Field label="Email address" htmlFor="email" required errors={errorsFor(state, 'email')}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={Boolean(errorsFor(state, 'email'))}
          />
        </Field>

        <Field label="Password" htmlFor="password" required errors={errorsFor(state, 'password')}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(errorsFor(state, 'password'))}
          />
        </Field>

        <SubmitButton size="lg" pendingLabel="Signing in…" className="w-full">
          Sign in
        </SubmitButton>
      </form>
    </Panel>
  )
}
