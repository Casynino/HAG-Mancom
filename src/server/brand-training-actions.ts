'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { desc, eq } from 'drizzle-orm'
import { brandTrainingAssets } from '@/db/schema'
import { recordAudit } from '@/lib/audit'
import { asActorWith } from '@/lib/authz/guard'
import {
  actionError,
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ActionResult,
} from '@/lib/errors'
import { getAiProvider } from '@/lib/ai/provider'
import { buildBrandAnalysisPrompt } from '@/lib/ai/document-assistant'
import { getStorage } from '@/lib/storage'
import { checkFile } from '@/lib/storage/limits'

/**
 * Brand training — Section 37.
 *
 * HA GROUP uploads documents it has already issued, and the assistant reports
 * what it can observe about how they are written: the document type, the
 * headings used, the standard clauses, the reference pattern.
 *
 * Three rules shape this module.
 *
 * It reports, it does not decide. Nothing here writes to company configuration.
 * The result is a proposal an Administrator reads; promoting any of it into a
 * Brand Profile is a separate, deliberate act — the brief is explicit that the
 * AI must not modify the company's knowledge base on its own.
 *
 * It only reads what it is given. The prompt carries extracted text and nothing
 * else — no client list, no prices, no other documents.
 *
 * It says when it does not know. The schema requires a confidence, and a single
 * example cannot establish a pattern; "low" is the expected answer more often
 * than not, and the screen shows it rather than hiding it.
 */

export interface BrandAnalysis {
  documentType: string | null
  fonts: string[]
  headings: string[]
  standardClauses: Array<{ heading: string; body: string }>
  referencePattern: string | null
  observations: string[]
  confidence: 'high' | 'medium' | 'low'
}

const ACCEPTED = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

/**
 * Pulls the words out of an upload.
 *
 * PDFs go through unpdf, which runs on a serverless runtime without a native
 * binary. A DOCX is a zip of XML; rather than add a parser, its text is left to
 * the uploader — the file is still stored as the record of what was supplied,
 * and the screen says plainly that it could not be read.
 */
async function extractText(bytes: Buffer, contentType: string): Promise<string | null> {
  if (contentType === 'text/plain' || contentType === 'text/markdown') {
    return bytes.toString('utf8')
  }

  if (contentType === 'application/pdf') {
    const { extractText: extract, getDocumentProxy } = await import('unpdf')
    const doc = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extract(doc, { mergePages: true })
    return String(text)
  }

  return null
}

export async function uploadTrainingDocumentAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const file = formData.get('document')
    const label = String(formData.get('label') ?? '').trim()
    const hint = String(formData.get('documentTypeHint') ?? '').trim() || null

    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError('Choose a document to upload.', {
        document: ['Attach a file.'],
      })
    }
    if (label.length < 3) {
      throw new ValidationError('Give it a label.', {
        label: ['Say what this document is, in a few words.'],
      })
    }
    if (!ACCEPTED.has(file.type)) {
      throw new ValidationError('That file type cannot be analysed.', {
        document: ['Upload a PDF, a Word document, or plain text.'],
      })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const check = checkFile({
      kind: 'document',
      filename: file.name,
      contentType: file.type,
      byteSize: bytes.byteLength,
      head: new Uint8Array(bytes.subarray(0, 32)),
    })
    if (!check.ok) {
      throw new ValidationError('That file cannot be accepted.', { document: [check.reason] })
    }

    // The storage key is derived from the content, and the column is unique —
    // so the same file uploaded twice is refused by the database rather than by
    // a check that could race.
    const checksum = createHash('sha256').update(bytes).digest('hex')

    const id = await asActorWith('config.manage', async (db, actor) => {
      const key = `brand-training/${checksum.slice(0, 2)}/${checksum}`

      const [existing] = await db
        .select({ label: brandTrainingAssets.label })
        .from(brandTrainingAssets)
        .where(eq(brandTrainingAssets.storageKey, key))
        .limit(1)

      if (existing) {
        throw new ConflictError(
          `That exact file is already here as "${existing.label}". Upload a different example.`,
        )
      }
      await getStorage().put(key, bytes, file.type)

      const [created] = await db
        .insert(brandTrainingAssets)
        .values({
          assetKind: 'historical_document',
          documentTypeHint: hint,
          label,
          storageKey: key,
          originalFilename: file.name,
          contentType: file.type,
          byteSize: bytes.byteLength,
          checksumSha256: checksum,
          analysisStatus: 'pending',
          uploadedBy: actor.id,
        })
        .returning({ id: brandTrainingAssets.id })

      await recordAudit(db, actor, {
        action: 'config.created',
        entityType: 'brand_training_assets',
        entityId: created!.id,
        metadata: { label, filename: file.name },
      })

      return created!.id
    })

    revalidatePath('/admin/brand-training')
    return {
      ok: true,
      data: { id },
      message: 'Uploaded. Run the analysis when you are ready.',
    }
  } catch (err) {
    return actionError(err)
  }
}

export async function analyseTrainingDocumentAction(
  _prev: ActionResult<BrandAnalysis> | null,
  formData: FormData,
): Promise<ActionResult<BrandAnalysis>> {
  try {
    const assetId = String(formData.get('assetId') ?? '')

    const provider = getAiProvider()
    if (!provider.isConfigured()) {
      throw new AppError(
        'The AI assistant is not configured. An Administrator must set ANTHROPIC_API_KEY before ' +
          'documents can be analysed. Uploads are kept either way.',
        'ai_unconfigured',
        503,
      )
    }

    const analysis = await asActorWith('config.manage', async (db, actor) => {
      const [asset] = await db
        .select()
        .from(brandTrainingAssets)
        .where(eq(brandTrainingAssets.id, assetId))
        .limit(1)

      if (!asset) throw new NotFoundError('That upload no longer exists.')

      // Read the words back out of the stored file rather than keeping a second
      // copy of them in the database.
      const bytes = await getStorage().get(asset.storageKey)
      const extracted = await extractText(bytes, asset.contentType)

      if (!extracted || extracted.trim().length < 40) {
        await db
          .update(brandTrainingAssets)
          .set({
            analysisStatus: 'skipped',
            analysisError:
              'No readable text could be taken from this file — it may be a scan. The file is kept as the record of what was supplied.',
          })
          .where(eq(brandTrainingAssets.id, assetId))

        throw new ConflictError(
          'No readable text could be taken from that file, so there is nothing to analyse. If it is a scan, it needs to be run through OCR first.',
        )
      }

      await db
        .update(brandTrainingAssets)
        .set({ analysisStatus: 'running', analysisError: null })
        .where(eq(brandTrainingAssets.id, assetId))

      const { system, prompt, schema } = buildBrandAnalysisPrompt({
        filename: asset.originalFilename,
        documentTypeHint: asset.documentTypeHint,
        extractedText: extracted,
      })

      try {
        const { value } = await provider.structured<BrandAnalysis>({
          system,
          prompt,
          schema,
          effort: 'medium',
        })

        await db
          .update(brandTrainingAssets)
          .set({
            analysisStatus: 'completed',
            analysisResult: value,
            analysisConfidence: { overall: value.confidence },
            analysisModel: provider.name,
            analysedAt: new Date(),
            analysisError: null,
          })
          .where(eq(brandTrainingAssets.id, assetId))

        await recordAudit(db, actor, {
          action: 'config.updated',
          entityType: 'brand_training_assets',
          entityId: assetId,
          metadata: { analysed: true, confidence: value.confidence },
        })

        return value
      } catch (err) {
        // A failed analysis is recorded, not swallowed — otherwise the row sits
        // at "running" for ever and nobody knows why.
        await db
          .update(brandTrainingAssets)
          .set({
            analysisStatus: 'failed',
            analysisError: err instanceof Error ? err.message : 'The analysis failed.',
          })
          .where(eq(brandTrainingAssets.id, assetId))
        throw err
      }
    })

    revalidatePath('/admin/brand-training')
    return {
      ok: true,
      data: analysis,
      message:
        analysis.confidence === 'low'
          ? 'Analysed, but the assistant is not confident — one example rarely establishes a pattern.'
          : 'Analysed. Read it before acting on any of it.',
    }
  } catch (err) {
    return actionError(err)
  }
}

/** Everything uploaded, newest first, for the review screen. */
export async function loadTrainingAssets() {
  return asActorWith('config.manage', async (db) =>
    db
      .select({
        id: brandTrainingAssets.id,
        label: brandTrainingAssets.label,
        documentTypeHint: brandTrainingAssets.documentTypeHint,
        originalFilename: brandTrainingAssets.originalFilename,
        contentType: brandTrainingAssets.contentType,
        byteSize: brandTrainingAssets.byteSize,
        analysisStatus: brandTrainingAssets.analysisStatus,
        analysisResult: brandTrainingAssets.analysisResult,
        analysisError: brandTrainingAssets.analysisError,
        analysedAt: brandTrainingAssets.analysedAt,
        uploadedAt: brandTrainingAssets.uploadedAt,
      })
      .from(brandTrainingAssets)
      .where(eq(brandTrainingAssets.assetKind, 'historical_document'))
      .orderBy(desc(brandTrainingAssets.uploadedAt))
      .limit(100),
  )
}
