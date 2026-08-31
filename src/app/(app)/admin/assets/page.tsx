import type { Metadata } from 'next'
import { asc, eq } from 'drizzle-orm'
import { companyAssets, profiles } from '@/db/schema'
import { AssetManager } from '@/components/asset-manager'
import { Notice, PageHeader, SectionBar } from '@/components/ui'
import { pageContext } from '@/lib/authz/guard'
import { canApplySignature, hasPermission } from '@/lib/authz/roles'
import { AuthorizationError } from '@/lib/errors'
import { resolveFont } from '@/lib/documents/render/fonts'

export const metadata: Metadata = { title: 'Brand assets' }

/**
 * Logo, partner marks, stamp and signatures.
 *
 * Reachable by Administrators, and by Directors for the single purpose of
 * uploading their own signature — which nobody else can do for them, and
 * without which they cannot sign a document at all.
 */
export default async function AssetsPage() {
  const data = await pageContext(async (db, actor) => {
    const isAdmin = hasPermission(actor.roles, 'asset.manage')
    const canUploadSignature = canApplySignature(actor.roles)

    if (!isAdmin && !canUploadSignature) {
      throw new AuthorizationError('Brand assets are managed by Administrators.')
    }

    const rows = await db
      .select({
        id: companyAssets.id,
        kind: companyAssets.kind,
        label: companyAssets.label,
        state: companyAssets.state,
        displayOrder: companyAssets.displayOrder,
        isDefault: companyAssets.isDefault,
        isSensitive: companyAssets.isSensitive,
        contentType: companyAssets.contentType,
        byteSize: companyAssets.byteSize,
        createdAt: companyAssets.createdAt,
        approvedAt: companyAssets.approvedAt,
        ownerUserId: companyAssets.ownerUserId,
        ownerName: profiles.fullName,
      })
      .from(companyAssets)
      .leftJoin(profiles, eq(profiles.id, companyAssets.ownerUserId))
      .orderBy(asc(companyAssets.kind), asc(companyAssets.displayOrder))

    const font = resolveFont()

    return {
      assets: rows,
      isAdmin,
      canUploadSignature,
      actorId: actor.id,
      fontNotice: font.isLicensedCenturyGothic ? null : font.substitutionNotice,
    }
  })

  const hasApprovedLogo = data.assets.some((a) => a.kind === 'logo' && a.state === 'approved')
  const hasApprovedStamp = data.assets.some((a) => a.kind === 'stamp' && a.state === 'approved')
  const hasOwnSignature = data.assets.some(
    (a) => a.kind === 'signature' && a.state === 'approved' && a.ownerUserId === data.actorId,
  )

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="Brand assets"
        description="The logo, partner marks, stamp and signatures that print on company documents."
        stats={[
          { label: 'assets held', value: data.assets.length },
          {
            label: 'in effect',
            value: data.assets.filter((a) => a.state === 'approved').length,
          },
        ]}
      />

      <SectionBar
        label="What prints on a document"
        scope="An asset has no effect until it is approved · the Director's signature is theirs alone to upload"
        tone={hasApprovedLogo && hasApprovedStamp ? 'ok' : 'warn'}
      />

      {!hasApprovedLogo || !hasApprovedStamp ? (
        <Notice tone="warn" title="Documents will print without these">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {!hasApprovedLogo ? (
              <li>No approved logo — the letterhead renders without a mark.</li>
            ) : null}
            {!hasApprovedStamp ? (
              <li>
                No approved company stamp — tax invoices cannot be stamped, and any document type
                that requires a stamp cannot be approved.
              </li>
            ) : null}
          </ul>
        </Notice>
      ) : null}

      {data.canUploadSignature && !hasOwnSignature ? (
        <Notice tone="warn" title="You have no signature on file">
          You cannot approve a document that requires a signature until you upload yours and an
          Administrator approves it. Nobody can upload it on your behalf — that is the point of a
          signature.
        </Notice>
      ) : null}

      {data.fontNotice ? (
        <Notice tone="neutral" title="Century Gothic is not installed">
          {data.fontNotice}
        </Notice>
      ) : null}

      <AssetManager
        assets={data.assets.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
          approvedAt: a.approvedAt?.toISOString() ?? null,
        }))}
        isAdmin={data.isAdmin}
        canUploadSignature={data.canUploadSignature}
        actorId={data.actorId}
      />
    </>
  )
}
