'use client'

import { useFormStatus } from 'react-dom'
import type { ReactNode } from 'react'
import { Button, Notice } from '@/components/ui'
import type { ActionResult } from '@/lib/errors'

/**
 * Form primitives.
 *
 * Every form in the platform reports the same four states — idle, submitting,
 * failed, succeeded — so a user never has to guess whether something worked.
 * `useFormStatus` gives the pending state without any per-form bookkeeping.
 */

export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
}: {
  children: ReactNode
  pendingLabel?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? (pendingLabel ?? 'Working…') : children}
    </Button>
  )
}

/** Renders whatever the last action returned. Null while nothing has happened. */
export function FormResult({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null

  if (!state.ok) {
    return (
      <Notice tone="risk" title="That did not go through">
        {state.error}
      </Notice>
    )
  }

  if (state.message) {
    return <Notice tone="ok">{state.message}</Notice>
  }

  return null
}

/** Pulls field-level errors out of an action result. */
export function errorsFor(
  state: ActionResult<unknown> | null,
  field: string,
): string[] | undefined {
  if (!state || state.ok) return undefined
  return state.fieldErrors?.[field]
}

/** Disables a fieldset while the enclosing form is submitting. */
export function PendingFieldset({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <fieldset disabled={pending} className={className}>
      {children}
    </fieldset>
  )
}
