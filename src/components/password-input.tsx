'use client'

import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/components/ui'

/**
 * A password field you can look at.
 *
 * Hiding what you type made sense when the risk was somebody reading over your
 * shoulder in an office. On a phone on a site in Morogoro, with a password an
 * administrator issued and nobody chose, it mostly produces failed sign-ins and
 * a locked account after five of them. So the eye is there.
 *
 * It starts hidden, and it is a button rather than a checkbox so a screen
 * reader announces what pressing it will do. `aria-pressed` carries the state,
 * and the label changes with it — "Show password" and "Hide password" — because
 * an unlabelled eye is a guess.
 *
 * Nothing is remembered between visits. A field that stays revealed because you
 * revealed it once, three days ago, is the shoulder-surfing problem back again
 * with none of the intent.
 */
export function PasswordInput({
  id,
  name,
  autoComplete,
  required,
  minLength,
  invalid,
  className,
}: {
  id: string
  name: string
  autoComplete?: string
  required?: boolean
  minLength?: number
  invalid?: boolean
  className?: string
}) {
  const [shown, setShown] = useState(false)
  const hintId = useId()

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        aria-invalid={invalid || undefined}
        aria-describedby={hintId}
        className={cn(
          'tap w-full rounded-lg border border-ink-300 bg-panel px-3 pr-11 text-ink-900',
          'placeholder:text-ink-400 transition-colors focus:border-brand-600 focus:outline-none',
          'focus:ring-2 focus:ring-brand-600/25 disabled:bg-ink-50 disabled:text-ink-500',
          'aria-[invalid=true]:border-risk-600',
          className,
        )}
      />

      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-controls={id}
        title={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-400 transition-colors hover:text-ink-700 focus:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40"
      >
        {shown ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
        <span className="sr-only">{shown ? 'Hide password' : 'Show password'}</span>
      </button>

      <span id={hintId} className="sr-only">
        {shown ? 'Password is visible.' : 'Password is hidden.'}
      </span>
    </div>
  )
}
