'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Plus, Trash2 } from 'lucide-react'
import { Badge, Field, Input, Panel, PanelHeader, Select, Textarea } from '@/components/ui'
import { errorsFor, FormResult, SubmitButton } from '@/components/form'
import { URGENCY_OPTIONS } from '@/lib/validation/schemas'
import { createSubmissionAction, saveSubmissionAction } from '@/server/submission-actions'

/**
 * The site submission form.
 *
 * Written for someone standing in a plant room on a phone: short questions,
 * plain wording, large controls, and no field that asks for a paragraph when a
 * sentence will do. Measurements are structured rather than typed into prose so
 * they can be carried into a quotation later without re-keying.
 */

export interface ProjectOption {
  id: string
  name: string
  reference: string
  clientName: string
}

export interface Measurement {
  label: string
  value: string
  unit: string
  notes?: string
}

export interface SubmissionFormValues {
  projectId: string
  title: string
  problemDescription: string
  recommendedWork: string
  urgency: string
  siteVisitDate: string
  gpsLatitude: string
  gpsLongitude: string
  gpsAccuracyMetres: string
  measurements: Measurement[]
}

const EMPTY: SubmissionFormValues = {
  projectId: '',
  title: '',
  problemDescription: '',
  recommendedWork: '',
  urgency: 'normal',
  siteVisitDate: '',
  gpsLatitude: '',
  gpsLongitude: '',
  gpsAccuracyMetres: '',
  measurements: [],
}

/** Common units first, so the usual case is one tap. */
const UNITS = ['mm', 'cm', 'm', 'kW', 'kVA', 'A', 'V', 'Hz', 'bar', '°C', 'rpm', 'L', 'kg', 'no.']

export function SubmissionForm({
  projects,
  initial,
  submissionId,
}: {
  projects: ProjectOption[]
  initial?: Partial<SubmissionFormValues>
  submissionId?: string
}) {
  const router = useRouter()
  const isEdit = Boolean(submissionId)
  const start = { ...EMPTY, ...initial }

  const [state, formAction] = useActionState(
    isEdit ? saveSubmissionAction : createSubmissionAction,
    null,
  )

  const [measurements, setMeasurements] = useState<Measurement[]>(start.measurements ?? [])
  const [gps, setGps] = useState({
    latitude: start.gpsLatitude,
    longitude: start.gpsLongitude,
    accuracy: start.gpsAccuracyMetres,
  })
  const [gpsState, setGpsState] = useState<'idle' | 'locating' | 'error'>('idle')
  const [gpsError, setGpsError] = useState<string | null>(null)

  // On create, the action returns the new id and we move to its page so the
  // Engineer can start adding photos — attachments need a record to attach to.
  // In an effect, not in render: navigation is a side effect.
  const createdId = state?.ok && !isEdit ? (state.data as { id?: string })?.id : undefined
  useEffect(() => {
    if (createdId) router.push(`/engineer/submissions/${createdId}`)
  }, [createdId, router])

  function captureLocation() {
    if (!('geolocation' in navigator)) {
      setGpsState('error')
      setGpsError('This device cannot provide a location.')
      return
    }

    setGpsState('locating')
    setGpsError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps({
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
          accuracy: position.coords.accuracy.toFixed(0),
        })
        setGpsState('idle')
      },
      (err) => {
        setGpsState('error')
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was declined. You can still submit without it.'
            : 'Could not get a location right now. You can still submit without it.',
        )
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    )
  }

  function updateMeasurement(index: number, patch: Partial<Measurement>) {
    setMeasurements((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {submissionId ? <input type="hidden" name="submissionId" value={submissionId} /> : null}
      <input
        type="hidden"
        name="measurements"
        value={JSON.stringify(
          measurements
            .filter((m) => m.label.trim() !== '' && m.value.trim() !== '')
            .map((m) => ({
              label: m.label.trim(),
              value: Number(m.value),
              unit: m.unit.trim() || 'no.',
              notes: m.notes?.trim() || undefined,
            })),
        )}
      />
      <input type="hidden" name="gpsLatitude" value={gps.latitude} />
      <input type="hidden" name="gpsLongitude" value={gps.longitude} />
      <input type="hidden" name="gpsAccuracyMetres" value={gps.accuracy} />

      <FormResult state={state} />

      {/* ---------------- Where ---------------- */}
      <Panel>
        <PanelHeader title="Where were you?" />
        <div className="space-y-4 p-4 sm:p-5">
          <Field
            label="Project"
            htmlFor="projectId"
            required
            hint={
              projects.length === 0
                ? undefined
                : 'Only projects you are assigned to are listed here.'
            }
            errors={errorsFor(state, 'projectId')}
          >
            {projects.length === 0 ? (
              <p className="rounded border border-warn-600/25 bg-warn-50 px-3 py-2.5 text-sm text-warn-700">
                You are not assigned to any project yet. Ask the Technical Officer to add you, then
                come back.
              </p>
            ) : (
              <Select id="projectId" name="projectId" defaultValue={start.projectId} required>
                <option value="">Choose a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.clientName} — {p.name} ({p.reference})
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Date of visit"
            htmlFor="siteVisitDate"
            errors={errorsFor(state, 'siteVisitDate')}
          >
            <Input
              id="siteVisitDate"
              name="siteVisitDate"
              type="date"
              defaultValue={start.siteVisitDate}
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-medium text-ink-800">
              Location
              <span className="ml-1.5 text-xs font-normal text-ink-400">optional</span>
            </p>
            <button
              type="button"
              onClick={captureLocation}
              disabled={gpsState === 'locating'}
              className="tap flex w-full items-center justify-center gap-2 rounded border border-ink-300 bg-panel px-4 text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:opacity-50"
            >
              <MapPin className="size-4" aria-hidden="true" />
              {gpsState === 'locating' ? 'Getting location…' : 'Use my current location'}
            </button>

            {gps.latitude ? (
              <p className="text-xs text-ink-500 tabular">
                Recorded {gps.latitude}, {gps.longitude}
                {gps.accuracy ? ` (±${gps.accuracy} m)` : ''}
              </p>
            ) : null}
            {gpsError ? <p className="text-xs text-warn-700">{gpsError}</p> : null}
          </div>
        </div>
      </Panel>

      {/* ---------------- What ---------------- */}
      <Panel>
        <PanelHeader title="What did you find?" />
        <div className="space-y-4 p-4 sm:p-5">
          <Field
            label="Short title"
            htmlFor="title"
            hint="One line the Technical Officer will see first."
            required
            errors={errorsFor(state, 'title')}
          >
            <Input
              id="title"
              name="title"
              defaultValue={start.title}
              placeholder="Cooling pump 2 vibrating"
              maxLength={200}
              required
            />
          </Field>

          <Field
            label="What is wrong"
            htmlFor="problemDescription"
            hint="A few sentences is enough. Photos carry the detail."
            required
            errors={errorsFor(state, 'problemDescription')}
          >
            <Textarea
              id="problemDescription"
              name="problemDescription"
              defaultValue={start.problemDescription}
              placeholder="Bearing noise on the drive end, heavy vibration above 40 Hz. Coupling guard is loose."
              maxLength={4000}
              rows={4}
              required
            />
          </Field>

          <Field
            label="What needs doing"
            htmlFor="recommendedWork"
            hint="Your recommendation. The Technical Officer prices it."
            required
            errors={errorsFor(state, 'recommendedWork')}
          >
            <Textarea
              id="recommendedWork"
              name="recommendedWork"
              defaultValue={start.recommendedWork}
              placeholder="Replace both bearings, re-align the coupling, refit the guard."
              maxLength={4000}
              rows={4}
              required
            />
          </Field>
        </div>
      </Panel>

      {/* ---------------- Urgency ---------------- */}
      <Panel>
        <PanelHeader title="How urgent is it?" />
        <fieldset className="space-y-2 p-4 sm:p-5">
          <legend className="sr-only">Urgency</legend>
          {URGENCY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="tap-lg flex cursor-pointer items-center gap-3 rounded border border-ink-200 px-4 has-checked:border-brand-600 has-checked:bg-brand-50"
            >
              <input
                type="radio"
                name="urgency"
                value={option.value}
                defaultChecked={start.urgency === option.value}
                className="size-4 accent-brand-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-900">{option.label}</span>
                <span className="block text-xs text-ink-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </Panel>

      {/* ---------------- Measurements ---------------- */}
      <Panel>
        <PanelHeader
          title="Measurements"
          description="Readings you took on site. Add as many as you need."
          action={
            <Badge tone={measurements.length > 0 ? 'brand' : 'neutral'}>
              {measurements.length}
            </Badge>
          }
        />
        <div className="space-y-3 p-4 sm:p-5">
          {measurements.map((m, index) => (
            <div key={index} className="rounded border border-ink-200 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
                <Input
                  aria-label={`Measurement ${index + 1} name`}
                  placeholder="What was measured"
                  value={m.label}
                  onChange={(e) => updateMeasurement(index, { label: e.target.value })}
                  maxLength={120}
                />
                <div className="flex gap-2">
                  <Input
                    aria-label={`Measurement ${index + 1} value`}
                    placeholder="0"
                    inputMode="decimal"
                    value={m.value}
                    onChange={(e) => updateMeasurement(index, { value: e.target.value })}
                    className="w-24 tabular"
                  />
                  <Select
                    aria-label={`Measurement ${index + 1} unit`}
                    value={m.unit}
                    onChange={(e) => updateMeasurement(index, { unit: e.target.value })}
                    className="w-24"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={() => setMeasurements((prev) => prev.filter((_, i) => i !== index))}
                  className="tap flex items-center justify-center gap-1.5 rounded px-3 text-sm text-risk-600 hover:bg-risk-50"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  <span className="sm:sr-only">Remove</span>
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setMeasurements((prev) => [...prev, { label: '', value: '', unit: 'mm' }])
            }
            className="tap flex w-full items-center justify-center gap-2 rounded border border-dashed border-ink-300 px-4 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add a measurement
          </button>

          {errorsFor(state, 'measurements') ? (
            <p className="text-sm text-risk-600" role="alert">
              {errorsFor(state, 'measurements')!.join(' ')}
            </p>
          ) : null}
        </div>
      </Panel>

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <SubmitButton size="lg" pendingLabel="Saving…" disabled={projects.length === 0}>
          {isEdit ? 'Save changes' : 'Save draft and add photos'}
        </SubmitButton>
      </div>

      {!isEdit ? (
        <p className="text-xs text-ink-400">
          Saving creates a draft. Nothing is sent to the Technical Officer until you submit it on
          the next screen.
        </p>
      ) : null}
    </form>
  )
}
