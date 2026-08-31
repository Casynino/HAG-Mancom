'use client'

import { useActionState } from 'react'
import { Field, Input } from '@/components/ui'
import { PasswordInput } from '@/components/password-input'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { signInAction } from '@/server/auth-actions'

export function SignInForm() {
  const [state, formAction] = useActionState(signInAction, null)

  return (
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
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          invalid={Boolean(errorsFor(state, 'password'))}
        />
      </Field>

      <SubmitButton size="lg" pendingLabel="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
    </form>
  )
}
