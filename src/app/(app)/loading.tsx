/** Shown while a signed-in page resolves its data. */
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="h-7 w-56 animate-pulse rounded bg-ink-200" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded bg-ink-100" />
      <div className="space-y-2 pt-2">
        <div className="h-20 animate-pulse rounded border border-ink-200 bg-white" />
        <div className="h-20 animate-pulse rounded border border-ink-200 bg-white" />
        <div className="h-20 animate-pulse rounded border border-ink-200 bg-white" />
      </div>
    </div>
  )
}
