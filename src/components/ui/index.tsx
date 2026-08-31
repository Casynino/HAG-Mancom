import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ComponentProps, ReactNode } from 'react'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors ' +
  'disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
  secondary:
    'bg-panel text-ink-800 border border-ink-300 hover:bg-ink-50 active:bg-ink-100',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-risk-600 text-white hover:bg-risk-700',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'tap px-4 text-sm',
  lg: 'tap-lg px-5 text-base w-full sm:w-auto',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

export function Panel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded border border-ink-200 bg-panel', className)} {...props} />
}

export function PanelHeader({
  title,
  description,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Form fields                                                                 */
/* -------------------------------------------------------------------------- */

const CONTROL =
  'w-full rounded border border-ink-300 bg-panel px-3 text-ink-900 placeholder:text-ink-400 ' +
  'focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 ' +
  'disabled:bg-ink-50 disabled:text-ink-500 aria-[invalid=true]:border-risk-600'

export function Field({
  label,
  hint,
  errors,
  required,
  htmlFor,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  errors?: string[]
  required?: boolean
  htmlFor?: string
  children: ReactNode
}) {
  const hasError = Boolean(errors?.length)
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-800">
        {label}
        {required ? (
          <span className="ml-1 text-risk-600" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-ink-400">optional</span>
        )}
      </label>
      {hint ? <p className="text-xs text-ink-500">{hint}</p> : null}
      {children}
      {hasError ? (
        <p className="text-sm text-risk-600" role="alert">
          {errors!.join(' ')}
        </p>
      ) : null}
    </div>
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(CONTROL, 'tap', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CONTROL, 'min-h-24 py-2 leading-relaxed', className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(CONTROL, 'tap', className)} {...props} />
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'risk'

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 border-ink-200',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  ok: 'bg-ok-50 text-ok-700 border-ok-600/25',
  warn: 'bg-warn-50 text-warn-700 border-warn-600/25',
  risk: 'bg-risk-50 text-risk-700 border-risk-600/25',
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
      {...props}
    />
  )
}

/** Banner for action results. `role="alert"` so screen readers announce it. */
export function Notice({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={cn('rounded border px-3 py-2.5 text-sm', TONES[tone])} role="alert">
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                 */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink-800">{title}</p>
      {description ? <p className="max-w-sm text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Page scaffolding                                                            */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-medium tracking-wider text-brand-600 uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function DescriptionList({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return (
    <dl className="divide-y divide-ink-100">
      {items.map(([term, value], i) => (
        <div key={i} className="grid grid-cols-1 gap-0.5 py-2.5 sm:grid-cols-3 sm:gap-4">
          <dt className="text-sm text-ink-500">{term}</dt>
          <dd className="text-sm text-ink-900 sm:col-span-2">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
