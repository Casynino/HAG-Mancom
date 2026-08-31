'use client'

import { useActionState, useState } from 'react'
import { KeyRound, Plus, ShieldCheck } from 'lucide-react'
import { Badge, Field, Input, Panel, PanelHeader } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { APP_ROLES, ROLE_LABELS, type AppRole } from '@/lib/authz/roles'
import { relativeTime } from '@/lib/display'
import {
  createUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
  updateUserRolesAction,
} from '@/server/admin-actions'

interface Person {
  id: string
  email: string
  fullName: string
  jobTitle: string | null
  phone: string | null
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt: Date | null
  lockedUntil: Date | null
  roles: AppRole[]
}

const ROLE_TONE: Record<AppRole, 'neutral' | 'brand' | 'ok' | 'warn'> = {
  engineer: 'neutral',
  technical_officer: 'brand',
  director: 'ok',
  administrator: 'warn',
}

/** Generated in the browser so a weak password is never typed by habit. */
function suggestPassword(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/[+/=]/g, '')
    .slice(0, 20)
}

export function UserManager({ people, actorId }: { people: Person[]; actorId: string }) {
  const [createState, createAction] = useActionState(createUserAction, null)
  const [rolesState, rolesAction] = useActionState(updateUserRolesAction, null)
  const [activeState, activeAction] = useActionState(setUserActiveAction, null)
  const [resetState, resetAction] = useActionState(resetUserPasswordAction, null)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [tempPassword, setTempPassword] = useState('')

  return (
    <>
      <FormResult state={rolesState} />
      <FormResult state={activeState} />
      <FormResult state={resetState} />

      <button
        type="button"
        onClick={() => {
          setShowForm((v) => !v)
          if (!showForm) setTempPassword(suggestPassword())
        }}
        className="tap flex items-center justify-center gap-2 btn-primary rounded-lg px-4 text-sm font-medium text-white sm:w-auto sm:self-start"
      >
        <Plus className="size-4" aria-hidden="true" />
        {showForm ? 'Close' : 'Add a person'}
      </button>

      {showForm ? (
        <Panel>
          <PanelHeader
            title="New account"
            description="They will be asked to set their own password the first time they sign in."
          />
          <form action={createAction} className="space-y-4 p-4 sm:p-5" noValidate>
            <FormResult state={createState} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Full name"
                htmlFor="fullName"
                required
                errors={errorsFor(createState, 'fullName')}
              >
                <Input id="fullName" name="fullName" required maxLength={160} />
              </Field>
              <Field
                label="Email address"
                htmlFor="email"
                required
                errors={errorsFor(createState, 'email')}
              >
                <Input id="email" name="email" type="email" required autoCapitalize="none" />
              </Field>
              <Field label="Job title" htmlFor="jobTitle">
                <Input id="jobTitle" name="jobTitle" maxLength={120} />
              </Field>
              <Field label="Phone" htmlFor="phone" errors={errorsFor(createState, 'phone')}>
                <Input id="phone" name="phone" type="tel" maxLength={40} />
              </Field>
            </div>

            <Field label="Roles" htmlFor="roles" required errors={errorsFor(createState, 'roles')}>
              <div className="grid gap-2 sm:grid-cols-2">
                {APP_ROLES.map((role) => (
                  <label
                    key={role}
                    className="tap flex cursor-pointer items-center gap-2.5 rounded border border-ink-200 px-3 has-checked:border-brand-600 has-checked:bg-brand-50"
                  >
                    <input
                      type="checkbox"
                      name="roles"
                      value={role}
                      className="size-4 accent-brand-600"
                    />
                    <span className="text-sm text-ink-800">{ROLE_LABELS[role]}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field
              label="Temporary password"
              htmlFor="temporaryPassword"
              hint="Give this to them directly. They must replace it at first sign-in."
              required
              errors={errorsFor(createState, 'temporaryPassword')}
            >
              <div className="flex gap-2">
                <Input
                  id="temporaryPassword"
                  name="temporaryPassword"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  className="font-mono"
                  required
                  minLength={12}
                />
                <button
                  type="button"
                  onClick={() => setTempPassword(suggestPassword())}
                  className="tap shrink-0 rounded border border-ink-300 bg-panel px-3 text-sm text-ink-700 hover:bg-ink-50"
                >
                  Regenerate
                </button>
              </div>
            </Field>

            <SubmitButton pendingLabel="Creating…">Create account</SubmitButton>
          </form>
        </Panel>
      ) : null}

      <Panel className="divide-y divide-ink-100">
        {people.map((p) => {
          const isSelf = p.id === actorId
          const locked = p.lockedUntil && new Date(p.lockedUntil) > new Date()

          return (
            <div key={p.id} className="px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink-900">{p.fullName}</p>
                    {isSelf ? <Badge tone="neutral">You</Badge> : null}
                    {!p.isActive ? <Badge tone="risk">Deactivated</Badge> : null}
                    {locked ? <Badge tone="warn">Locked</Badge> : null}
                    {p.mustChangePassword ? <Badge tone="warn">Password not yet set</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {p.email}
                    {p.jobTitle ? ` · ${p.jobTitle}` : ''}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.roles.length === 0 ? (
                      <Badge tone="risk">No role — cannot use the platform</Badge>
                    ) : (
                      p.roles.map((r) => (
                        <Badge key={r} tone={ROLE_TONE[r]}>
                          {ROLE_LABELS[r]}
                        </Badge>
                      ))
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-400">
                    {p.lastLoginAt
                      ? `Last signed in ${relativeTime(p.lastLoginAt)}`
                      : 'Never signed in'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(editing === p.id ? null : p.id)}
                    className="flex h-9 items-center gap-1.5 rounded border border-ink-300 bg-panel px-3 text-sm text-ink-700 hover:bg-ink-50"
                  >
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    Roles
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetting(resetting === p.id ? null : p.id)
                      setNewPassword(suggestPassword())
                    }}
                    className="flex h-9 items-center gap-1.5 rounded border border-ink-300 bg-panel px-3 text-sm text-ink-700 hover:bg-ink-50"
                  >
                    <KeyRound className="size-4" aria-hidden="true" />
                    Reset
                  </button>
                  {!isSelf ? (
                    <form action={activeAction}>
                      <input type="hidden" name="userId" value={p.id} />
                      <input type="hidden" name="isActive" value={String(!p.isActive)} />
                      <SubmitButton
                        variant={p.isActive ? 'ghost' : 'secondary'}
                        size="sm"
                        pendingLabel="Saving…"
                      >
                        {p.isActive ? 'Deactivate' : 'Reactivate'}
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </div>

              {editing === p.id ? (
                <form
                  action={rolesAction}
                  className="mt-3 rounded border border-ink-200 bg-ink-50 p-3"
                >
                  <input type="hidden" name="userId" value={p.id} />
                  <p className="mb-2 text-sm font-medium text-ink-800">Roles for {p.fullName}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {APP_ROLES.map((role) => (
                      <label
                        key={role}
                        className="tap flex cursor-pointer items-center gap-2.5 rounded border border-ink-200 bg-panel px-3 has-checked:border-brand-600 has-checked:bg-brand-50"
                      >
                        <input
                          type="checkbox"
                          name="roles"
                          value={role}
                          defaultChecked={p.roles.includes(role)}
                          className="size-4 accent-brand-600"
                        />
                        <span className="text-sm text-ink-800">{ROLE_LABELS[role]}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3">
                    <SubmitButton size="sm" pendingLabel="Saving…">
                      Save roles
                    </SubmitButton>
                  </div>
                </form>
              ) : null}

              {resetting === p.id ? (
                <form
                  action={resetAction}
                  className="mt-3 space-y-2 rounded border border-warn-600/25 bg-warn-50 p-3"
                >
                  <input type="hidden" name="userId" value={p.id} />
                  <Field
                    label={`New temporary password for ${p.fullName}`}
                    htmlFor={`pw-${p.id}`}
                    hint="This ends all their current sessions and forces a change at next sign-in."
                    required
                    errors={errorsFor(resetState, 'temporaryPassword')}
                  >
                    <Input
                      id={`pw-${p.id}`}
                      name="temporaryPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="font-mono"
                      minLength={12}
                      required
                    />
                  </Field>
                  <SubmitButton variant="secondary" size="sm" pendingLabel="Resetting…">
                    Set temporary password
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          )
        })}
      </Panel>
    </>
  )
}
