import Link from 'next/link'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ComponentProps, ReactNode } from 'react'
import { ArrowRight, ChevronRight } from 'lucide-react'

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
  primary: 'bg-brand-600 text-white active:bg-brand-800',
  secondary: 'bg-panel text-ink-800 border border-ink-300 hover:bg-ink-50 active:bg-ink-100',
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
          <p className="text-[11px] font-semibold tracking-[0.16em] text-live-700 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display mt-1.5 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">{description}</p>
        ) : null}
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

/**
 * A headline figure with somewhere to go.
 *
 * Every one of these is derived from a query, never a stored counter — a
 * dashboard that reports a number nobody can reconcile against the records is
 * worse than no dashboard. `href` is not optional by accident: a figure that
 * demands attention should take you to the thing that needs it.
 */
export function StatCard({
  label,
  value,
  meta,
  href,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  meta?: ReactNode
  href: string
  icon?: ReactNode
  tone?: 'neutral' | 'brand' | 'warn' | 'risk' | 'ok'
}) {
  const accent = {
    neutral: 'text-ink-400',
    brand: 'text-brand-600',
    warn: 'text-warn-600',
    risk: 'text-risk-600',
    ok: 'text-ok-600',
  }[tone]

  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-xl border border-ink-200 bg-panel p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase">
          {label}
        </p>
        {icon ? (
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink-50',
              accent,
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>

      <p className="font-display mt-4 text-3xl font-bold tracking-tight text-ink-950 tabular sm:text-4xl">
        {value}
      </p>
      {meta ? <p className="mt-1.5 text-xs text-ink-500">{meta}</p> : null}
    </Link>
  )
}

/**
 * A donut showing one proportion. Pure SVG — a chart library for a single ring
 * would be more bytes than the rest of the page.
 */
export function Ring({
  percent,
  label,
  sublabel,
  tone = 'ok',
}: {
  percent: number
  label: string
  sublabel?: string
  tone?: 'ok' | 'warn' | 'risk'
}) {
  const clamped = Math.max(0, Math.min(100, percent))
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const stroke = { ok: 'stroke-ok-600', warn: 'stroke-warn-600', risk: 'stroke-risk-600' }[tone]

  return (
    <div className="relative flex size-36 items-center justify-center">
      <svg viewBox="0 0 128 128" className="size-full -rotate-90">
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
          className="stroke-ink-200"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className={cn(stroke, 'transition-[stroke-dashoffset] duration-1000 ease-out')}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <div className="absolute text-center">
        <p className="font-display text-2xl font-bold text-ink-950 tabular">{label}</p>
        {sublabel ? (
          <p className="text-[10px] tracking-[0.14em] text-ink-500 uppercase">{sublabel}</p>
        ) : null}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Command-centre layout                                                       */
/*                                                                            */
/* Patterns modelled on the Target Express Air Cargo operations portal, which  */
/* HA GROUP pointed at as the arrangement they want. Layout only — every       */
/* figure these render still comes from the same queries as before.            */
/*                                                                            */
/* What is actually borrowed is an ordering principle rather than a skin: the  */
/* page opens by naming the person and giving them the one control they came   */
/* for, then what is waiting on them, then the money, then the desks. Cards    */
/* are joined into one bordered strip instead of floating separately, which    */
/* reads as a single instrument panel rather than five unrelated tiles. And    */
/* every figure carries a line of plain English underneath saying what it      */
/* actually counts, which is the detail that makes their portal legible.       */
/* -------------------------------------------------------------------------- */

/**
 * The banner that opens a command centre: who you are, what today is, and the
 * one or two things you most likely came to do.
 */
export function WelcomeBanner({
  greeting,
  name,
  line,
  pills,
  actions,
}: {
  greeting: string
  name: string
  line: string
  pills?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="relative isolate overflow-hidden rounded-2xl bg-sidebar px-5 py-6 sm:px-7 sm:py-8">
      {/* Two soft washes rather than a flat fill, so the band has depth without
          becoming a photograph competing with the type. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-16 size-[26rem] rounded-full bg-brand-600/35 blur-[90px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -bottom-32 size-[24rem] rounded-full bg-live-500/20 blur-[90px]"
      />

      <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
        <div className="min-w-0">
          {pills ? <div className="flex flex-wrap items-center gap-2">{pills}</div> : null}
          <h1 className="font-display mt-3 text-2xl font-bold tracking-tight text-white sm:text-[2rem]">
            {greeting}, {name}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/60">{line}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}

/** A small pill for the banner: today's date, the signed-in role. */
export function BannerPill({ children, dot }: { children: ReactNode; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-medium tracking-wide text-white/85">
      {dot ? <span className="size-1.5 rounded-full bg-live-400" aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

/**
 * The coloured pill row under the banner — the handful of destinations someone
 * reaches for by name rather than by hunting the sidebar.
 */
export function QuickActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

export function QuickAction({
  href,
  icon,
  children,
  tone = 'neutral',
  count,
}: {
  href: string
  icon?: ReactNode
  children: ReactNode
  tone?: 'neutral' | 'brand' | 'warn' | 'risk' | 'ok'
  count?: number
}) {
  const tones = {
    neutral: 'border-ink-200 bg-panel text-ink-700 hover:border-ink-300 hover:bg-ink-50',
    brand: 'border-brand-600/30 bg-brand-600/10 text-brand-700 hover:bg-brand-600/15',
    warn: 'border-warn-600/30 bg-warn-600/10 text-warn-700 hover:bg-warn-600/15',
    risk: 'border-risk-600/30 bg-risk-600/10 text-risk-700 hover:bg-risk-600/15',
    ok: 'border-ok-600/30 bg-ok-600/10 text-ok-700 hover:bg-ok-600/15',
  }[tone]

  return (
    <Link
      href={href}
      className={cn(
        'tap inline-flex items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
        tones,
      )}
    >
      {icon}
      {children}
      {typeof count === 'number' && count > 0 ? (
        <span className="rounded-full bg-current/15 px-1.5 py-0.5 text-[11px] font-semibold tabular">
          {count}
        </span>
      ) : null}
    </Link>
  )
}

/**
 * The label above a band of content: what it is, what it means, and where the
 * full version lives. The right-hand link matters — it is how a summary admits
 * that it is a summary.
 */
export function SectionHead({
  label,
  description,
  count,
  href,
  linkLabel,
}: {
  label: string
  description?: string
  count?: number
  href?: string
  linkLabel?: string
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
          {label}
          {typeof count === 'number' && count > 0 ? (
            <span className="rounded-full bg-live-400/20 px-1.5 py-0.5 text-[10px] font-bold text-live-700 tabular">
              {count}
            </span>
          ) : null}
        </p>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          {linkLabel ?? 'See all'}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  )
}

/**
 * A row of headline figures joined into one instrument panel.
 *
 * Deliberately not separate floating cards: five numbers that must be read
 * together should look like one object. The dividers do the separating.
 */
export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 divide-y divide-ink-200 overflow-hidden rounded-xl border border-ink-200 bg-panel sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3 xl:grid-cols-5 [&>*]:sm:border-r [&>*]:sm:border-ink-200 [&>*:last-child]:sm:border-r-0 sm:[&>*:nth-child(-n+3)]:border-b sm:[&>*:nth-child(-n+3)]:border-ink-200 xl:[&>*]:border-b-0">
      {children}
    </div>
  )
}

/**
 * One cell of a StatStrip.
 *
 * `note` is the important part and the thing worth copying from their portal:
 * one line of plain English saying what the number actually counts. "Billed
 * today" and "invoiced today, not yet money" are different claims, and the
 * second is the one that stops somebody misreading the first.
 */
export function Stat({
  label,
  value,
  prefix,
  note,
  chip,
  icon,
  href,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  prefix?: string
  note?: string
  chip?: ReactNode
  icon?: ReactNode
  href?: string
  tone?: 'neutral' | 'brand' | 'warn' | 'risk' | 'ok'
}) {
  const tint = {
    neutral: '',
    brand: 'bg-brand-600/[0.04]',
    warn: 'bg-warn-600/[0.05]',
    risk: 'bg-risk-600/[0.05]',
    ok: 'bg-ok-600/[0.05]',
  }[tone]

  const figure = {
    neutral: 'text-ink-950',
    brand: 'text-brand-700',
    warn: 'text-warn-700',
    risk: 'text-risk-700',
    ok: 'text-ok-700',
  }[tone]

  const body = (
    <>
      {/* The label reserves two lines whether it needs them or not. Without it
          a wrapping label ("With the Director") pushes its own figure down and
          the whole row stops reading as one instrument. */}
      <div className="flex min-h-[2.4em] items-start justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase">
          {label}
        </p>
        {icon ? <span className="shrink-0 text-ink-400">{icon}</span> : null}
      </div>

      <p className="font-display flex items-baseline gap-1.5 tracking-tight tabular">
        {prefix ? <span className="text-sm font-semibold text-ink-500">{prefix}</span> : null}
        <span className={cn('text-3xl font-bold', figure)}>{value}</span>
      </p>

      {chip ? <div className="mt-2.5">{chip}</div> : null}
      {note ? <p className="mt-2.5 text-xs leading-relaxed text-ink-500">{note}</p> : null}
    </>
  )

  const className = cn(
    'flex flex-col p-4 sm:p-5',
    tint,
    href ? 'transition-colors hover:bg-ink-50' : '',
  )

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

/** The small boxed sub-figure inside a Stat — their "ON THE INVOICE" chip. */
export function StatChip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-2 py-1">
      <span className="text-[10px] font-semibold tracking-[0.12em] text-ink-500 uppercase">
        {label}
      </span>
      <span className="font-mono text-xs text-ink-800 tabular">{children}</span>
    </span>
  )
}

/**
 * One line in "needs your attention": what is wrong, why it matters in plain
 * words, and a way straight to it.
 */
export function AttentionItem({
  href,
  icon,
  title,
  line,
  tone = 'warn',
}: {
  href: string
  icon?: ReactNode
  title: ReactNode
  line?: ReactNode
  tone?: 'warn' | 'risk' | 'brand'
}) {
  const bar = { warn: 'bg-warn-600', risk: 'bg-risk-600', brand: 'bg-brand-600' }[tone]
  const glyph = { warn: 'text-warn-600', risk: 'text-risk-600', brand: 'text-brand-600' }[tone]

  return (
    <Link
      href={href}
      className="group relative flex items-start gap-3 overflow-hidden rounded-xl border border-ink-200 bg-panel py-3.5 pr-4 pl-5 transition-colors hover:bg-ink-50"
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', bar)} aria-hidden="true" />
      {icon ? <span className={cn('mt-0.5 shrink-0', glyph)}>{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-900">{title}</span>
        {line ? <span className="mt-0.5 block text-sm text-ink-500">{line}</span> : null}
      </span>
      <ChevronRight
        className="mt-0.5 size-4 shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  )
}

/** The grid of desks — where each part of the work actually lives. */
export function DeskGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  )
}

export function Desk({
  href,
  title,
  description,
  status,
}: {
  href: string
  title: string
  description: string
  status?: ReactNode
}) {
  return (
    <Link
      href={href}
      className="group flex items-start justify-between gap-3 bg-panel p-4 transition-colors hover:bg-ink-50 sm:p-5"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">{title}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-ink-500">{description}</span>
      </span>
      {status ? (
        <span className="shrink-0 text-xs text-ink-400">{status}</span>
      ) : (
        <ChevronRight
          className="size-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      )}
    </Link>
  )
}

/**
 * A single line of number-and-label pairs — their "where the cargo is" strip.
 * For a set of small counts that belong to one question and would be absurd as
 * five separate cards.
 */
export function InlineStats({
  label,
  items,
  trailing,
}: {
  label: string
  items: Array<{ value: ReactNode; label: string; href?: string; tone?: 'neutral' | 'warn' | 'ok' }>
  trailing?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-ink-200 bg-panel px-5 py-4">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-ink-500 uppercase">{label}</p>
      {items.map((item, i) => {
        const figure = {
          neutral: 'text-ink-950',
          warn: 'text-warn-700',
          ok: 'text-ok-700',
        }[item.tone ?? 'neutral']

        const inner = (
          <>
            <span className={cn('font-display text-xl font-bold tabular', figure)}>
              {item.value}
            </span>
            <span className="text-sm text-ink-500">{item.label}</span>
          </>
        )
        return item.href ? (
          <Link key={i} href={item.href} className="flex items-baseline gap-2 hover:underline">
            {inner}
          </Link>
        ) : (
          <span key={i} className="flex items-baseline gap-2">
            {inner}
          </span>
        )
      })}
      {trailing ? <span className="ml-auto text-xs text-ink-400">{trailing}</span> : null}
    </div>
  )
}
