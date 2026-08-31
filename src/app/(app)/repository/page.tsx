import Link from 'next/link'
import type { Metadata } from 'next'
import { sql } from 'drizzle-orm'
import { Badge, EmptyState, Input, PageHeader, Panel, Select } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { formatAmount } from '@/lib/finance/decimal'
import { DOCUMENT_STATUS, DOCUMENT_TYPE_LABELS, formatDate } from '@/lib/display'
import { DOCUMENT_TYPES } from '@/lib/validation/document-schemas'

export const metadata: Metadata = { title: 'Repository' }

const PAGE_SIZE = 25

/**
 * The central document repository — Stage 7.
 *
 * Search and paging happen in Postgres, not in the browser. The brief is
 * explicit that the whole repository must never be loaded client-side to
 * filter it, and as HA GROUP accumulates years of documents that stops being a
 * style preference.
 *
 * Every row the query returns has already passed Row Level Security, so a
 * search can never surface a document the searcher cannot open.
 */
export default async function RepositoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const q = (params.q ?? '').trim()
  const documentType = params.documentType ?? ''
  const status = params.status ?? ''
  const from = params.from ?? ''
  const to = params.to ?? ''
  const page = Math.max(1, Number(params.page ?? '1') || 1)

  const { rows, total } = await pageContext(async (db, actor) => {
    if (!hasPermission(actor.roles, 'document.view')) {
      throw new AuthorizationError('The repository is available to staff.')
    }

    // Values are parameterised throughout; the enum casts are the only literals.
    const like = q ? `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%` : null

    const filters = sql`
      where 1 = 1
        ${
          like
            ? sql`and (
            d.reference ilike ${like}
            or d.title ilike ${like}
            or d.scope_description ilike ${like}
            or d.filename ilike ${like}
            or c.legal_name ilike ${like}
            or p.name ilike ${like}
            or p.reference ilike ${like}
            or po.po_number ilike ${like}
          )`
            : sql``
        }
        ${documentType ? sql`and d.document_type = ${documentType}::public.document_type` : sql``}
        ${status ? sql`and d.status = ${status}::public.document_status` : sql``}
        ${from ? sql`and d.document_date >= ${from}::date` : sql``}
        ${to ? sql`and d.document_date <= ${to}::date` : sql``}
    `

    const base = sql`
      from public.documents d
      join public.clients c on c.id = d.client_id
      join public.projects p on p.id = d.project_id
      left join public.client_purchase_orders po on po.id = d.client_purchase_order_id
      ${filters}
    `

    const [countResult, pageResult] = await Promise.all([
      db.execute(sql`select count(*)::int as n ${base}`),
      db.execute(sql`
        select
          d.id, d.reference, d.document_type, d.title, d.status, d.currency,
          d.grand_total, d.document_date, d.filename,
          c.legal_name as client_name,
          p.name as project_name,
          po.po_number
        ${base}
        order by d.document_date desc nulls last, d.updated_at desc
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
      `),
    ])

    return {
      total: Number((countResult.rows[0] as { n: number } | undefined)?.n ?? 0),
      rows: pageResult.rows as Array<Record<string, string | null>>,
    }
  })

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const buildHref = (nextPage: number) => {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (documentType) sp.set('documentType', documentType)
    if (status) sp.set('status', status)
    if (from) sp.set('from', from)
    if (to) sp.set('to', to)
    if (nextPage > 1) sp.set('page', String(nextPage))
    const query = sp.toString()
    return query ? `/repository?${query}` : '/repository'
  }

  return (
    <>
      <PageHeader
        eyebrow="Repository"
        title="All documents"
        description={
          total === 0
            ? 'Nothing matches.'
            : `${total} document${total === 1 ? '' : 's'}${q ? ` matching “${q}”` : ''}.`
        }
      />

      {/* A plain GET form: the search is bookmarkable and survives a reload. */}
      <Panel>
        <form method="get" className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
          <div className="sm:col-span-2 lg:col-span-3">
            <label htmlFor="q" className="mb-1 block text-xs font-medium text-ink-700">
              Search
            </label>
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Reference, client, project, PO number, title or filename"
            />
          </div>

          <div>
            <label htmlFor="documentType" className="mb-1 block text-xs font-medium text-ink-700">
              Type
            </label>
            <Select id="documentType" name="documentType" defaultValue={documentType}>
              <option value="">Any type</option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DOCUMENT_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="status" className="mb-1 block text-xs font-medium text-ink-700">
              Status
            </label>
            <Select id="status" name="status" defaultValue={status}>
              <option value="">Any status</option>
              {Object.entries(DOCUMENT_STATUS).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="from" className="mb-1 block text-xs font-medium text-ink-700">
                From
              </label>
              <Input id="from" name="from" type="date" defaultValue={from} />
            </div>
            <div>
              <label htmlFor="to" className="mb-1 block text-xs font-medium text-ink-700">
                To
              </label>
              <Input id="to" name="to" type="date" defaultValue={to} />
            </div>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="tap btn-primary rounded-lg px-4 text-sm font-medium text-white"
            >
              Search
            </button>
            {q || documentType || status || from || to ? (
              <Link
                href="/repository"
                className="tap inline-flex items-center rounded border border-ink-300 bg-panel px-4 text-sm text-ink-700 hover:bg-ink-50"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </Panel>

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nothing matches"
            description="Try a shorter search, or clear the filters."
          />
        </Panel>
      ) : (
        <Panel className="divide-y divide-ink-100">
          {rows.map((row) => {
            const statusMeta = DOCUMENT_STATUS[row.status ?? ''] ?? {
              label: row.status ?? '',
              tone: 'neutral' as const,
            }
            return (
              <Link
                key={row.id ?? ''}
                href={`/technical/documents/${row.id}`}
                className="block px-4 py-3.5 hover:bg-ink-50 sm:px-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">
                    {DOCUMENT_TYPE_LABELS[row.document_type ?? ''] ?? row.document_type}
                  </Badge>
                  <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                  {row.reference ? (
                    <span className="font-mono text-xs text-ink-400 tabular">{row.reference}</span>
                  ) : null}
                  {row.po_number ? (
                    <span className="font-mono text-xs text-ink-400">PO {row.po_number}</span>
                  ) : null}
                </div>

                <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-ink-900">{row.title}</p>
                  {row.grand_total ? (
                    <p className="text-sm font-medium text-ink-900 tabular">
                      {row.currency} {formatAmount(row.grand_total)}
                    </p>
                  ) : null}
                </div>

                <p className="mt-0.5 text-sm text-ink-500">
                  {row.client_name} · {row.project_name}
                </p>
                <p className="mt-1 text-xs text-ink-400">{formatDate(row.document_date)}</p>
              </Link>
            )
          })}
        </Panel>
      )}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={buildHref(page - 1)}
              className="tap inline-flex items-center rounded border border-ink-300 bg-panel px-4 text-sm text-ink-700 hover:bg-ink-50"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-500 tabular">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={buildHref(page + 1)}
              className="tap inline-flex items-center rounded border border-ink-300 bg-panel px-4 text-sm text-ink-700 hover:bg-ink-50"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </>
  )
}
