'use client'

import { useActionState, useState } from 'react'
import { AlertTriangle, ArrowRight, Eye, EyeOff } from 'lucide-react'
import { errorsFor } from '@/components/form'
import { signInAction } from '@/server/auth-actions'
import { useFormStatus } from 'react-dom'

/**
 * The sign-in card, styled explicitly rather than from the shared kit.
 *
 * Every other surface in the platform takes its colours from the ink tokens,
 * which invert with the theme. This one cannot: the page behind it is the navy
 * shell in both themes, because the globe needs a dark ground. Rendering the
 * usual Panel there produced a near-black box sitting on navy — two darks that
 * do not belong to each other, which is exactly what it looked like.
 *
 * So the card is a translucent lift of the navy itself, and the controls are
 * written for that ground: white type, hairline borders, and the company's gold
 * on the button rather than the platform's blue. It is the one screen a person
 * sees before they are inside the product, and it should look like the company
 * rather than like a form.
 */

function SignInButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="tap-lg flex w-full items-center justify-center gap-2 rounded-xl bg-live-400 px-5 text-sm font-semibold text-sidebar transition-all hover:bg-live-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-live-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar disabled:opacity-60"
    >
      {pending ? 'Signing in…' : 'Sign in'}
      {pending ? null : <ArrowRight className="size-4" aria-hidden="true" />}
    </button>
  )
}

const FIELD =
  'w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-3 text-[15px] text-white ' +
  'placeholder:text-white/30 transition-colors focus:border-live-400/70 focus:bg-white/[0.09] ' +
  'focus:outline-none focus:ring-2 focus:ring-live-400/25 aria-[invalid=true]:border-[#e8817a]/70'

export function SignInForm() {
  const [state, formAction] = useActionState(signInAction, null)
  const [shown, setShown] = useState(false)

  const emailErrors = errorsFor(state, 'email')
  const passwordErrors = errorsFor(state, 'password')

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state && !state.ok ? (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-risk-500/30 bg-risk-500/10 px-3.5 py-3 text-sm text-risk-200"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-white/75">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-invalid={Boolean(emailErrors)}
          className={FIELD}
        />
        {emailErrors ? <p className="text-sm text-[#f0a19b]">{emailErrors.join(' ')}</p> : null}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-white/75">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={shown ? 'text' : 'password'}
            autoComplete="current-password"
            required
            aria-invalid={Boolean(passwordErrors)}
            className={`${FIELD} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-pressed={shown}
            aria-controls="password"
            title={shown ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-white/40 transition-colors hover:text-white focus:outline-none focus-visible:text-white"
          >
            {shown ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
            <span className="sr-only">{shown ? 'Hide password' : 'Show password'}</span>
          </button>
        </div>
        {passwordErrors ? (
          <p className="text-sm text-[#f0a19b]">{passwordErrors.join(' ')}</p>
        ) : null}
      </div>

      <SignInButton />
    </form>
  )
}
