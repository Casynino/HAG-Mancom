'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Plus, UserMinus, UserPlus } from 'lucide-react'
import {
  Badge,
  EmptyState,
  Field,
  Input,
  Panel,
  PanelHeader,
  Select,
  Textarea,
} from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import {
  addProjectMemberAction,
  createProjectAction,
  removeProjectMemberAction,
} from '@/server/records-actions'

interface ProjectRow {
  id: string
  name: string
  reference: string
  location: string | null
  status: string
  clientId: string
  clientName: string
  submissionCount: number
}

interface MemberRow {
  id: string
  projectId: string
  userId: string
  isLead: boolean
  roleOnProject: string | null
  fullName: string
}

const STATUS_TONE: Record<string, 'neutral' | 'brand' | 'ok' | 'warn'> = {
  planning: 'neutral',
  active: 'brand',
  on_hold: 'warn',
  completed: 'ok',
  archived: 'neutral',
}

export function ProjectManager({
  projects,
  clients,
  engineers,
  members,
  canAssign,
  canCreate,
}: {
  projects: ProjectRow[]
  clients: Array<{ id: string; legalName: string }>
  engineers: Array<{ id: string; fullName: string }>
  members: MemberRow[]
  canAssign: boolean
  canCreate: boolean
}) {
  const [createState, createAction] = useActionState(createProjectAction, null)
  const [addState, addAction] = useActionState(addProjectMemberAction, null)
  const [removeState, removeAction] = useActionState(removeProjectMemberAction, null)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <>
      <FormResult state={addState} />
      <FormResult state={removeState} />

      {canCreate ? (
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="tap flex items-center justify-center gap-2 rounded bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 sm:w-auto sm:self-start"
        >
          <Plus className="size-4" aria-hidden="true" />
          {showForm ? 'Close' : 'New project'}
        </button>
      ) : null}

      {showForm ? (
        <Panel>
          <PanelHeader title="New project" />
          <form action={createAction} className="space-y-4 p-4 sm:p-5" noValidate>
            <FormResult state={createState} />

            {clients.length === 0 ? (
              <p className="rounded border border-warn-600/25 bg-warn-50 px-3 py-2.5 text-sm text-warn-700">
                Add a client first — a project must belong to one.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Client"
                  htmlFor="clientId"
                  required
                  errors={errorsFor(createState, 'clientId')}
                >
                  <Select id="clientId" name="clientId" required>
                    <option value="">Choose a client…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.legalName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Project reference"
                  htmlFor="reference"
                  hint="HA GROUP's own reference for this job."
                  required
                  errors={errorsFor(createState, 'reference')}
                >
                  <Input id="reference" name="reference" required maxLength={60} />
                </Field>
                <Field
                  label="Project name"
                  htmlFor="name"
                  required
                  errors={errorsFor(createState, 'name')}
                >
                  <Input id="name" name="name" required maxLength={200} />
                </Field>
                <Field label="Site location" htmlFor="location">
                  <Input id="location" name="location" maxLength={300} />
                </Field>
                <Field label="Start date" htmlFor="startDate">
                  <Input id="startDate" name="startDate" type="date" />
                </Field>
                <Field label="Expected completion" htmlFor="expectedCompletionDate">
                  <Input
                    id="expectedCompletionDate"
                    name="expectedCompletionDate"
                    type="date"
                  />
                </Field>
              </div>
            )}

            <Field label="Description" htmlFor="description">
              <Textarea id="description" name="description" rows={2} maxLength={4000} />
            </Field>

            <SubmitButton pendingLabel="Creating…" disabled={clients.length === 0}>
              Create project
            </SubmitButton>
          </form>
        </Panel>
      ) : null}

      <Panel className="divide-y divide-ink-100">
        {projects.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Create a project against a client, then assign the Engineers who will visit the site."
          />
        ) : (
          projects.map((p) => {
            const projectMembers = members.filter((m) => m.projectId === p.id)
            const isOpen = expanded === p.id
            const unassigned = engineers.filter(
              (e) => !projectMembers.some((m) => m.userId === e.id),
            )

            return (
              <div key={p.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/technical/projects/${p.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {p.name}
                      </Link>
                      <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>
                        {p.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-ink-500">{p.clientName}</p>
                    <p className="mt-1 font-mono text-xs text-ink-400 tabular">
                      {p.reference}
                      {p.location ? <span className="font-sans"> · {p.location}</span> : null}
                      <span className="font-sans">
                        {' '}
                        · {p.submissionCount} submission{p.submissionCount === 1 ? '' : 's'}
                      </span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : p.id)}
                    className="tap flex items-center gap-1.5 rounded border border-ink-300 bg-white px-3 text-sm text-ink-700 hover:bg-ink-50"
                    aria-expanded={isOpen}
                  >
                    <UserPlus className="size-4" aria-hidden="true" />
                    Team ({projectMembers.length})
                  </button>
                </div>

                {isOpen ? (
                  <div className="mt-3 rounded border border-ink-200 bg-ink-50 p-3">
                    {projectMembers.length === 0 ? (
                      <p className="text-sm text-ink-500">
                        Nobody is assigned. An Engineer cannot file against this project until they
                        are.
                      </p>
                    ) : (
                      <ul className="divide-y divide-ink-200">
                        {projectMembers.map((m) => (
                          <li key={m.id} className="flex items-center gap-2 py-2">
                            <span className="flex-1 text-sm text-ink-800">
                              {m.fullName}
                              {m.isLead ? (
                                <Badge tone="brand" className="ml-2">
                                  Lead
                                </Badge>
                              ) : null}
                            </span>
                            {canAssign ? (
                              <form action={removeAction}>
                                <input type="hidden" name="memberId" value={m.id} />
                                <input type="hidden" name="projectId" value={p.id} />
                                <SubmitButton
                                  variant="ghost"
                                  size="sm"
                                  pendingLabel="Removing…"
                                >
                                  <UserMinus className="size-4 text-risk-600" aria-hidden="true" />
                                  <span className="sr-only">Remove {m.fullName}</span>
                                </SubmitButton>
                              </form>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}

                    {canAssign && unassigned.length > 0 ? (
                      <form action={addAction} className="mt-3 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="projectId" value={p.id} />
                        <div className="min-w-48 flex-1">
                          <label
                            htmlFor={`assign-${p.id}`}
                            className="mb-1 block text-xs font-medium text-ink-700"
                          >
                            Assign someone
                          </label>
                          <Select id={`assign-${p.id}`} name="userId" required>
                            {unassigned.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.fullName}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <label className="tap flex items-center gap-2 text-sm text-ink-700">
                          <input
                            type="checkbox"
                            name="isLead"
                            className="size-4 accent-brand-600"
                          />
                          Lead
                        </label>
                        <SubmitButton variant="secondary" pendingLabel="Assigning…">
                          Assign
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </Panel>
    </>
  )
}
