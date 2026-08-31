'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq } from 'drizzle-orm'
import { companyAssets, configChangeLog } from '@/db/schema'
import { recordAudit } from '@/lib/audit'
import { asActorWith, requireActorOrThrow } from '@/lib/authz/guard'
import { canApplySignature } from '@/lib/authz/roles'
import {
  actionError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ActionResult,
} from '@/lib/errors'
import { checksum, companyAssetKey, getStorage } from '@/lib/storage'
import { checkFile, sanitiseFilename } from '@/lib/storage/limits'

/**
 * Company brand assets — logo, partner marks, stamp and signatures.
 *
 * Two rules distinguish this from ordinary file upload:
 *
 *   * a signature belongs to one person. Only that person can upload it, and
 *     only they can ever apply it. An Administrator can approve it for use but
 *     cannot upload one on someone else's behalf — that would make the
 *     signature meaningless.
 *   * nothing is usable until approved. An uploaded stamp sits in `draft` and
 *     will not appear on a document.
 */

const ASSET_KINDS = ['logo', 'partner_mark', 'stamp', 'signature', 'letterhead'] as const
type AssetKind = (typeof ASSET_KINDS)[number]

export async function uploadCompanyAssetAction(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const kind = String(formData.get('kind') ?? '') as AssetKind
    const label = String(formData.get('label') ?? '').trim()
    const displayOrder = Number(formData.get('displayOrder') ?? 0) || 0
    const file = formData.get('file')

    if (!ASSET_KINDS.includes(kind)) {
      throw new ValidationError('Choose what kind of asset this is.', {
        kind: ['Unknown asset kind.'],
      })
    }
    if (label.length < 2) {
      throw new ValidationError('Give the asset a name.', {
        label: ['A short name is required, e.g. "Company stamp".'],
      })
    }
    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError('Choose a file.', { file: ['No file was selected.'] })
    }

    const actor = await requireActorOrThrow()

    // A signature is personal. Uploading one for someone else is refused here,
    // and the RLS policy on company_assets refuses it independently.
    if (kind === 'signature' && !canApplySignature(actor.roles)) {
      throw new AuthorizationError(
        'Only a Director can hold a signature on file, because only a Director can apply one.',
      )
    }
    if (kind !== 'signature' && !actor.roles.includes('administrator')) {
      throw new AuthorizationError('Brand assets are managed by Administrators.')
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const verdict = checkFile({
      kind: 'photo',
      filename: file.name,
      contentType: file.type,
      byteSize: buffer.byteLength,
      head: new Uint8Array(buffer.subarray(0, 32)),
    })
    if (!verdict.ok) {
      throw new ValidationError(verdict.reason, { file: [verdict.reason] })
    }

    // A signature or stamp with a transparent background prints correctly over
    // the document; a JPEG puts a white box over whatever it sits on.
    if ((kind === 'signature' || kind === 'stamp') && file.type !== 'image/png') {
      throw new ValidationError(
        'Upload a PNG. A signature or stamp needs a transparent background, and a JPEG will print a white box over the document.',
        { file: ['PNG only, with a transparent background.'] },
      )
    }

    const storageKey = companyAssetKey(kind, file.name)

    const id = await asActorWith('document.view', async (db, act) => {
      await getStorage().put(storageKey, buffer, file.type)

      try {
        const [created] = await db
          .insert(companyAssets)
          .values({
            kind,
            label,
            storageKey,
            contentType: file.type,
            byteSize: buffer.byteLength,
            checksumSha256: checksum(buffer),
            displayOrder,
            // A signature is bound to its owner at upload and can never be
            // reassigned; the column is what the seal trigger checks.
            ownerUserId: kind === 'signature' ? act.id : null,
            isSensitive: kind === 'signature' || kind === 'stamp',
            state: 'draft',
          })
          .returning({ id: companyAssets.id })

        await recordAudit(db, act, {
          action: 'asset.uploaded',
          entityType: 'company_assets',
          entityId: created!.id,
          metadata: { kind, label, byteSize: buffer.byteLength },
        })

        return created!.id
      } catch (err) {
        await getStorage().remove(storageKey).catch(() => undefined)
        throw err
      }
    })

    revalidatePath('/admin/assets')
    return {
      ok: true,
      data: { id },
      message:
        kind === 'signature'
          ? 'Signature uploaded. An Administrator must approve it before you can sign documents with it.'
          : 'Uploaded as a draft. Approve it to start using it on documents.',
    }
  } catch (err) {
    return actionError(err)
  }
}

/**
 * Approves or rejects an asset.
 *
 * Approving a logo, stamp or letterhead supersedes the one it replaces, so a
 * document rendered last year still points at the mark that was actually on it.
 * Signatures are per-person and are not superseded by someone else's.
 */
export async function decideAssetAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const assetId = String(formData.get('assetId') ?? '')
    const decision = String(formData.get('decision') ?? '')
    const comment = String(formData.get('comment') ?? '').trim() || null

    if (decision !== 'approve' && decision !== 'reject') {
      throw new ValidationError('Choose approve or reject.')
    }
    if (decision === 'reject' && !comment) {
      throw new ValidationError('Say why you are rejecting it.', {
        comment: ['A reason is required when rejecting.'],
      })
    }

    await asActorWith('config.approve', async (db, actor) => {
      const [asset] = await db
        .select()
        .from(companyAssets)
        .where(eq(companyAssets.id, assetId))
        .limit(1)

      if (!asset) throw new NotFoundError('That asset no longer exists.')
      if (asset.state === 'approved' && decision === 'approve') {
        throw new ConflictError('That asset is already in use.')
      }

      if (decision === 'approve') {
        if (asset.kind === 'signature') {
          // One approved signature per person.
          await db
            .update(companyAssets)
            .set({ state: 'superseded' })
            .where(
              and(
                eq(companyAssets.kind, 'signature'),
                eq(companyAssets.state, 'approved'),
                eq(companyAssets.ownerUserId, asset.ownerUserId!),
              ),
            )
        } else if (asset.kind === 'stamp' || asset.kind === 'logo' || asset.kind === 'letterhead') {
          await db
            .update(companyAssets)
            .set({ state: 'superseded' })
            .where(and(eq(companyAssets.kind, asset.kind), eq(companyAssets.state, 'approved')))
        }

        await db
          .update(companyAssets)
          .set({
            state: 'approved',
            approvedBy: actor.id,
            approvedAt: new Date(),
            // The logo and stamp a document reaches for by default.
            isDefault: asset.kind === 'logo' || asset.kind === 'stamp',
          })
          .where(eq(companyAssets.id, assetId))
      } else {
        await db
          .update(companyAssets)
          .set({ state: 'rejected', notes: comment })
          .where(eq(companyAssets.id, assetId))
      }

      await db.insert(configChangeLog).values({
        entityTable: 'company_assets',
        entityId: assetId,
        fromState: asset.state,
        toState: decision === 'approve' ? 'approved' : 'rejected',
        actorId: actor.id,
        comment,
      })

      await recordAudit(db, actor, {
        action: decision === 'approve' ? 'config.approved' : 'config.rejected',
        entityType: 'company_assets',
        entityId: assetId,
        metadata: { kind: asset.kind, label: asset.label, comment },
      })
    })

    revalidatePath('/admin/assets')
    revalidatePath('/approvals')
    return {
      ok: true,
      data: null,
      message: decision === 'approve' ? 'Approved and now in use.' : 'Rejected.',
    }
  } catch (err) {
    return actionError(err)
  }
}

/** Reorders the OEM partner marks across the letterhead. */
export async function reorderPartnerMarksAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const raw = formData.get('order')
    const order: string[] =
      typeof raw === 'string' && raw.trim() !== '' ? (JSON.parse(raw) as string[]) : []

    if (order.length === 0) throw new ValidationError('Nothing to reorder.')

    await asActorWith('asset.manage', async (db, actor) => {
      for (const [index, id] of order.entries()) {
        await db
          .update(companyAssets)
          .set({ displayOrder: index })
          .where(and(eq(companyAssets.id, id), eq(companyAssets.kind, 'partner_mark')))
      }

      await recordAudit(db, actor, {
        action: 'config.updated',
        entityType: 'company_assets',
        metadata: { reordered: order.length, kind: 'partner_mark' },
      })
    })

    revalidatePath('/admin/assets')
    return { ok: true, data: null, message: 'Order saved.' }
  } catch (err) {
    return actionError(err)
  }
}
