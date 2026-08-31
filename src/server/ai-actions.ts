'use server'

import { asc, eq } from 'drizzle-orm'
import {
  aiInteractions,
  clients,
  documentLines,
  documents,
  engineerSubmissions,
  projects,
  submissionMeasurements,
} from '@/db/schema'
import { recordAudit } from '@/lib/audit'
import { asActorWith } from '@/lib/authz/guard'
import {
  actionError,
  AppError,
  NotFoundError,
  ValidationError,
  type ActionResult,
} from '@/lib/errors'
import { AI_MODEL, getAiProvider } from '@/lib/ai/provider'
import {
  buildCompletenessPrompt,
  buildLetterPrompt,
  buildScopePrompt,
  type CompletenessReport,
  type LetterDraft,
  type ScopeDraft,
} from '@/lib/ai/document-assistant'
import { checkConfigReadiness } from '@/lib/finance/config'

/**
 * The AI Document Studio — Stage 6.
 *
 * Every action here reads its context through the acting user's RLS session, so
 * the assistant can only ever see what that person could already open. There is
 * no service-role path and no shared context cache.
 *
 * Nothing returned by these actions is written to a document automatically. The
 * Technical Officer is shown the draft and chooses what to keep.
 */

async function recordInteraction(
  db: Parameters<Parameters<typeof asActorWith>[1]>[0],
  actorId: string,
  input: {
    purpose: string
    entityType: string
    entityId: string
    promptSummary: string
    usage?: { inputTokens: number; outputTokens: number; latencyMs: number }
    error?: string
  },
) {
  await db.insert(aiInteractions).values({
    purpose: input.purpose,
    provider: getAiProvider().name,
    model: AI_MODEL,
    entityType: input.entityType,
    entityId: input.entityId,
    promptSummary: input.promptSummary,
    inputTokens: input.usage?.inputTokens ?? null,
    outputTokens: input.usage?.outputTokens ?? null,
    latencyMs: input.usage?.latencyMs ?? null,
    succeeded: input.error ? 'false' : 'true',
    failureReason: input.error ?? null,
    requestedBy: actorId,
  })
}

/**
 * Drafts scope wording and line descriptions from an accepted site submission.
 *
 * Returns a draft for review. It writes nothing to the document.
 */
export async function draftScopeFromSubmissionAction(
  _prev: ActionResult<ScopeDraft> | null,
  formData: FormData,
): Promise<ActionResult<ScopeDraft>> {
  try {
    const submissionId = String(formData.get('submissionId') ?? '')
    const servicePeriodLabel = String(formData.get('servicePeriodLabel') ?? '').trim() || null

    const provider = getAiProvider()
    if (!provider.isConfigured()) {
      throw new AppError(
        'The AI assistant is not configured. An Administrator must set ANTHROPIC_API_KEY. ' +
          'You can still write the scope by hand.',
        'ai_unconfigured',
        503,
      )
    }

    const draft = await asActorWith('document.create', async (db, actor) => {
      // Read under the actor's session: if they cannot see the submission,
      // neither can the assistant.
      const [row] = await db
        .select({
          submission: engineerSubmissions,
          projectName: projects.name,
          clientName: clients.legalName,
        })
        .from(engineerSubmissions)
        .innerJoin(projects, eq(projects.id, engineerSubmissions.projectId))
        .innerJoin(clients, eq(clients.id, engineerSubmissions.clientId))
        .where(eq(engineerSubmissions.id, submissionId))
        .limit(1)

      if (!row) throw new NotFoundError('That submission does not exist, or you cannot access it.')

      const measurements = await db
        .select()
        .from(submissionMeasurements)
        .where(eq(submissionMeasurements.submissionId, submissionId))
        .orderBy(asc(submissionMeasurements.position))

      const { system, prompt, schema } = buildScopePrompt({
        clientName: row.clientName,
        projectName: row.projectName,
        submissionTitle: row.submission.title,
        problemDescription: row.submission.problemDescription,
        recommendedWork: row.submission.recommendedWork,
        urgency: row.submission.urgency,
        servicePeriodLabel,
        measurements: measurements.map((m) => ({
          label: m.label,
          value: m.value,
          unit: m.unit,
        })),
      })

      try {
        const { value, usage } = await provider.structured<ScopeDraft>({
          system,
          prompt,
          schema,
          effort: 'medium',
        })

        await recordInteraction(db, actor.id, {
          purpose: 'scope_draft',
          entityType: 'engineer_submissions',
          entityId: submissionId,
          promptSummary: `Scope draft for ${row.clientName} / ${row.projectName}`,
          usage,
        })

        await recordAudit(db, actor, {
          action: 'ai.draft_generated',
          entityType: 'engineer_submissions',
          entityId: submissionId,
          metadata: {
            purpose: 'scope_draft',
            model: AI_MODEL,
            lines: value.lineDescriptions.length,
          },
        })

        return value
      } catch (err) {
        await recordInteraction(db, actor.id, {
          purpose: 'scope_draft',
          entityType: 'engineer_submissions',
          entityId: submissionId,
          promptSummary: `Scope draft for ${row.clientName} / ${row.projectName}`,
          error: err instanceof Error ? err.message : 'unknown',
        })
        throw err
      }
    })

    return {
      ok: true,
      data: draft,
      message:
        draft.missing.length > 0
          ? `Draft ready. ${draft.missing.length} thing(s) still need your input before pricing.`
          : 'Draft ready. Review and edit before using it.',
    }
  } catch (err) {
    return actionError(err)
  }
}

export async function draftLetterAction(
  _prev: ActionResult<LetterDraft> | null,
  formData: FormData,
): Promise<ActionResult<LetterDraft>> {
  try {
    const clientId = String(formData.get('clientId') ?? '')
    const subject = String(formData.get('subject') ?? '').trim()
    const intent = String(formData.get('intent') ?? '').trim()
    const tone = String(formData.get('tone') ?? 'neutral')

    if (subject.length < 3) {
      throw new ValidationError('Give the letter a subject.', {
        subject: ['A subject is required.'],
      })
    }
    if (intent.length < 20) {
      throw new ValidationError('Say what the letter should cover.', {
        intent: ['Describe what you want the letter to say, in a sentence or two.'],
      })
    }

    const provider = getAiProvider()
    if (!provider.isConfigured()) {
      throw new AppError(
        'The AI assistant is not configured. An Administrator must set ANTHROPIC_API_KEY.',
        'ai_unconfigured',
        503,
      )
    }

    const draft = await asActorWith('document.create', async (db, actor) => {
      const [client] = await db
        .select({ legalName: clients.legalName, contactPerson: clients.contactPerson })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1)

      if (!client) throw new NotFoundError('That client does not exist, or you cannot access it.')

      const { system, prompt, schema } = buildLetterPrompt({
        clientName: client.legalName,
        recipientName: client.contactPerson,
        subject,
        intent,
        tone: tone === 'firm' || tone === 'apologetic' ? tone : 'neutral',
      })

      try {
        const { value, usage } = await provider.structured<LetterDraft>({
          system,
          prompt,
          schema,
          effort: 'medium',
        })

        await recordInteraction(db, actor.id, {
          purpose: 'letter_draft',
          entityType: 'clients',
          entityId: clientId,
          promptSummary: `Letter draft: ${subject}`,
          usage,
        })

        await recordAudit(db, actor, {
          action: 'ai.draft_generated',
          entityType: 'clients',
          entityId: clientId,
          metadata: { purpose: 'letter_draft', model: AI_MODEL },
        })

        return value
      } catch (err) {
        await recordInteraction(db, actor.id, {
          purpose: 'letter_draft',
          entityType: 'clients',
          entityId: clientId,
          promptSummary: `Letter draft: ${subject}`,
          error: err instanceof Error ? err.message : 'unknown',
        })
        throw err
      }
    })

    return {
      ok: true,
      data: draft,
      message: 'Draft ready. Edit it before submitting for approval.',
    }
  } catch (err) {
    return actionError(err)
  }
}

/**
 * Checks what is still missing on a document.
 *
 * Falls back to a deterministic check when the assistant is unavailable, so
 * this feature degrades to something useful rather than to nothing. The
 * deterministic answer is also the authoritative one — the model only adds
 * commentary.
 */
export async function checkDocumentCompletenessAction(
  _prev: ActionResult<CompletenessReport> | null,
  formData: FormData,
): Promise<ActionResult<CompletenessReport>> {
  try {
    const documentId = String(formData.get('documentId') ?? '')

    const report = await asActorWith('document.view', async (db, actor) => {
      const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
      if (!doc) throw new NotFoundError('That document does not exist, or you cannot access it.')

      const lines = await db
        .select({ id: documentLines.id })
        .from(documentLines)
        .where(eq(documentLines.documentId, documentId))
        .limit(1)

      const evidence = await db.execute(
        (await import('drizzle-orm')).sql`
          select
            app.invoice_evidence_exists(${doc.projectId}::uuid, ${doc.clientPurchaseOrderId}::uuid) as has_evidence
        `,
      )
      const hasEvidence = Boolean(
        (evidence.rows[0] as { has_evidence: boolean } | undefined)?.has_evidence,
      )

      const readiness = await checkConfigReadiness(db, doc.documentType, doc.currency)

      // The deterministic answer. This is what actually governs.
      const blocking: string[] = []
      if (!lines.length && doc.documentType !== 'official_letter') {
        blocking.push('No line items have been added.')
      }
      if (doc.documentType === 'tax_invoice' && !doc.clientPurchaseOrderId) {
        blocking.push('The client Purchase Order has not been recorded against this invoice.')
      }
      if (doc.documentType === 'tax_invoice' && !hasEvidence) {
        blocking.push(
          'There is no confirmed Delivery Note or verified completion evidence for this project.',
        )
      }
      blocking.push(...readiness.missing)

      const base: CompletenessReport = {
        readyToSubmit: blocking.length === 0,
        blocking,
        advisory: [...readiness.warnings],
      }

      const provider = getAiProvider()
      if (!provider.isConfigured()) return base

      const { system, prompt, schema } = buildCompletenessPrompt({
        documentType: doc.documentType,
        hasClient: Boolean(doc.clientId),
        hasProject: Boolean(doc.projectId),
        hasPurchaseOrder: Boolean(doc.clientPurchaseOrderId),
        hasLines: lines.length > 0,
        hasScope: Boolean(doc.scopeDescription),
        hasTerms: Boolean(doc.terms),
        hasDeliveryEvidence: hasEvidence,
        hasCompletionEvidence: hasEvidence,
        configurationGaps: readiness.missing,
      })

      try {
        const { value, usage } = await provider.structured<CompletenessReport>({
          system,
          prompt,
          schema,
          effort: 'low',
        })

        await recordInteraction(db, actor.id, {
          purpose: 'completeness_check',
          entityType: 'documents',
          entityId: documentId,
          promptSummary: `Completeness check for ${doc.documentType}`,
          usage,
        })

        // The model's opinion is merged as ADVISORY only. It can never clear a
        // blocking item the platform found.
        return {
          readyToSubmit: base.readyToSubmit,
          blocking: base.blocking,
          advisory: [...new Set([...base.advisory, ...value.advisory, ...value.blocking])].filter(
            (a) => !base.blocking.includes(a),
          ),
        }
      } catch {
        // The assistant failing must not stop a Technical Officer working.
        return base
      }
    })

    return {
      ok: true,
      data: report,
      message: report.readyToSubmit
        ? 'Nothing is blocking submission.'
        : `${report.blocking.length} thing(s) must be resolved before this can be submitted.`,
    }
  } catch (err) {
    return actionError(err)
  }
}
