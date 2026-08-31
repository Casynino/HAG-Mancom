import 'server-only'

import { and, asc, eq } from 'drizzle-orm'
import type { Database } from '@/db/client'
import {
  bankAccounts,
  brandProfiles,
  clientContacts,
  clientPurchaseOrders,
  clientVendorIdentities,
  clients,
  companyAssets,
  documentCharges,
  documentLines,
  documentSeals,
  documentVersions,
  documents,
  entityAddresses,
  legalEntities,
  profiles,
} from '@/db/schema'
import { NotFoundError } from '@/lib/errors'
import { getStorage } from '@/lib/storage'
import { resolveFont } from './fonts'
import { layoutFor, type RenderAsset, type RenderDocument, type RenderSeal } from './model'

/**
 * Assembles the render model from stored data.
 *
 * Two rules govern this file:
 *
 * 1. Only APPROVED brand assets and configuration are used. A draft logo or an
 *    unapproved address never reaches a rendered document.
 * 2. Nothing is invented. Where a value is missing, the block that would have
 *    shown it is omitted and the omission is reported, rather than filled with
 *    a plausible-looking placeholder.
 */

/**
 * Reads an approved asset and inlines it as a data URI.
 *
 * The renderer runs server-side and cannot fetch from an authenticated route,
 * so bytes are embedded. Assets are small brand marks, so this is cheap.
 */
async function loadAsset(
  storageKey: string,
  contentType: string,
  label: string,
): Promise<RenderAsset | null> {
  try {
    const bytes = await getStorage().get(storageKey)
    return {
      source: `data:${contentType};base64,${bytes.toString('base64')}`,
      label,
    }
  } catch {
    // A missing asset must not stop a document rendering; the document simply
    // prints without it, and the caller's `warnings` records why.
    return null
  }
}

export interface BuildResult {
  model: RenderDocument
  /** Things a human should know about this rendering. */
  warnings: string[]
}

export async function buildRenderModel(
  db: Database,
  documentId: string,
  options: { includeSeals?: boolean; watermark?: string | null } = {},
): Promise<BuildResult> {
  const warnings: string[] = []

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
  if (!doc) throw new NotFoundError('That document does not exist, or you cannot access it.')

  const [client] = await db.select().from(clients).where(eq(clients.id, doc.clientId)).limit(1)
  if (!client) throw new NotFoundError('The client record for this document is missing.')

  const [lines, charges] = await Promise.all([
    db
      .select()
      .from(documentLines)
      .where(eq(documentLines.documentId, documentId))
      .orderBy(asc(documentLines.position)),
    db
      .select()
      .from(documentCharges)
      .where(eq(documentCharges.documentId, documentId))
      .orderBy(asc(documentCharges.position)),
  ])

  // ---- Company configuration, approved only --------------------------------
  const [entity] = doc.legalEntityId
    ? await db.select().from(legalEntities).where(eq(legalEntities.id, doc.legalEntityId)).limit(1)
    : await db
        .select()
        .from(legalEntities)
        .where(and(eq(legalEntities.state, 'approved'), eq(legalEntities.isDefault, true)))
        .limit(1)

  if (!entity) {
    throw new NotFoundError(
      'No approved legal entity is configured. An Administrator must approve the company details before documents can be rendered.',
    )
  }
  if (entity.state !== 'approved') {
    warnings.push(`The legal entity "${entity.name}" is not approved. This rendering is a preview.`)
  }

  const [address] = doc.entityAddressId
    ? await db
        .select()
        .from(entityAddresses)
        .where(eq(entityAddresses.id, doc.entityAddressId))
        .limit(1)
    : await db
        .select()
        .from(entityAddresses)
        .where(
          and(
            eq(entityAddresses.legalEntityId, entity.id),
            eq(entityAddresses.state, 'approved'),
            eq(entityAddresses.isDefault, true),
          ),
        )
        .limit(1)

  if (!address)
    warnings.push('No approved company address is set, so the letterhead has no address.')

  const [bank] = doc.bankAccountId
    ? await db.select().from(bankAccounts).where(eq(bankAccounts.id, doc.bankAccountId)).limit(1)
    : []

  // ---- Brand assets, approved only ----------------------------------------
  const assets = await db
    .select()
    .from(companyAssets)
    .where(eq(companyAssets.state, 'approved'))
    .orderBy(asc(companyAssets.displayOrder))

  const logoRow =
    assets.find((a) => a.kind === 'logo' && a.isDefault) ?? assets.find((a) => a.kind === 'logo')
  const logo = logoRow
    ? await loadAsset(logoRow.storageKey, logoRow.contentType, logoRow.label)
    : null
  if (!logo) warnings.push('No approved company logo is available, so the letterhead has no mark.')

  const partnerMarks: RenderAsset[] = []
  for (const mark of assets.filter((a) => a.kind === 'partner_mark')) {
    const loaded = await loadAsset(mark.storageKey, mark.contentType, mark.label)
    if (loaded) partnerMarks.push(loaded)
  }

  // ---- Seals ---------------------------------------------------------------
  const seals: RenderSeal[] = []
  if (options.includeSeals) {
    const [approvedVersion] = await db
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentId, documentId),
          eq(documentVersions.isApprovedVersion, true),
        ),
      )
      .limit(1)

    if (approvedVersion) {
      // Same reason as above: name the profile columns, never select the row.
      const sealRows = await db
        .select({ seal: documentSeals, actorName: profiles.fullName })
        .from(documentSeals)
        .leftJoin(profiles, eq(profiles.id, documentSeals.appliedBy))
        .where(eq(documentSeals.documentVersionId, approvedVersion.id))

      for (const row of sealRows) {
        const asset = assets.find((a) => a.id === row.seal.companyAssetId)
        if (!asset) continue
        const loaded = await loadAsset(asset.storageKey, asset.contentType, asset.label)
        if (!loaded) continue

        seals.push({
          kind: row.seal.sealKind === 'stamp' ? 'stamp' : 'signature',
          source: loaded.source,
          appliedByName: row.actorName ?? 'Authorised signatory',
          appliedByRole: row.seal.appliedByRole,
          appliedAt: new Date(row.seal.appliedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        })
      }
    }
  }

  // ---- Client-side identifiers --------------------------------------------
  const [vendorIdentity] = await db
    .select()
    .from(clientVendorIdentities)
    .where(
      and(
        eq(clientVendorIdentities.clientId, client.id),
        eq(clientVendorIdentities.state, 'approved'),
      ),
    )
    .limit(1)

  const [contact] = doc.clientContactId
    ? await db
        .select()
        .from(clientContacts)
        .where(eq(clientContacts.id, doc.clientContactId))
        .limit(1)
    : await db
        .select()
        .from(clientContacts)
        .where(and(eq(clientContacts.clientId, client.id), eq(clientContacts.isPrimary, true)))
        .limit(1)

  const [po] = doc.clientPurchaseOrderId
    ? await db
        .select()
        .from(clientPurchaseOrders)
        .where(eq(clientPurchaseOrders.id, doc.clientPurchaseOrderId))
        .limit(1)
    : []

  // Columns are named explicitly: a bare select() would ask for password_hash,
  // which the application role has no grant on, and the whole render would fail
  // with a permission error rather than a missing name.
  const [preparer] = doc.preparedBy
    ? await db
        .select({
          fullName: profiles.fullName,
          jobTitle: profiles.jobTitle,
          phone: profiles.phone,
          email: profiles.email,
        })
        .from(profiles)
        .where(eq(profiles.id, doc.preparedBy))
        .limit(1)
    : []

  // ---- Brand profile wording ----------------------------------------------
  const [brand] = await db
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.state, 'approved'))
    .limit(1)

  const brandPayload = (brand?.payload ?? {}) as {
    footer?: { tagline?: string; showsDirectors?: boolean; appliesTo?: string[] }
    standardWording?: Record<string, string>
    directorsLine?: string
  }

  if (!brand) {
    warnings.push(
      'No approved Brand Profile is active, so standard company wording and the footer tagline are omitted.',
    )
  }

  const layout = layoutFor(doc.documentType)
  const font = resolveFont()

  if (!font.isLicensedCenturyGothic) {
    warnings.push(font.substitutionNotice ?? 'A substitute typeface was used.')
  }

  const isDraft = doc.status !== 'approved' && doc.status !== 'issued'

  const model: RenderDocument = {
    documentType: doc.documentType,
    typeLabel: layout.label,
    reference: doc.reference,
    documentDate: doc.documentDate
      ? new Date(doc.documentDate)
          .toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
          .toUpperCase()
      : null,

    company: {
      entityName: entity.name,
      addressLines: address
        ? [address.addressLine1, address.addressLine2, address.addressLine3].filter(
            (l): l is string => Boolean(l),
          )
        : [],
      city: address?.city ?? null,
      country: address?.country ?? 'Tanzania',
      phone: address?.phone ?? null,
      alternatePhone: address?.alternatePhone ?? null,
      whatsapp: address?.whatsapp ?? null,
      email: address?.email ?? null,
      website: address?.website ?? null,
      tin: entity.tin,
      vrn: entity.vrn,
      registrationNumber: entity.registrationNumber,
      businessLicence: entity.businessLicence,
      importExportLicence: entity.importExportLicence,
      fineprint: null,
    },

    client: {
      name: client.legalName,
      contactPerson: contact?.fullName ?? client.contactPerson ?? null,
      addressLines: [
        client.addressLine1,
        client.addressLine2,
        client.postalAddress,
        client.city,
      ].filter((l): l is string => Boolean(l)),
      phone: contact?.phone ?? client.contactPhone ?? null,
      email: contact?.email ?? client.contactEmail ?? null,
      tin: client.tin,
      vrn: client.vrn,
      vendorId: vendorIdentity?.vendorId ?? null,
      accountNumber: vendorIdentity?.accountNumber ?? null,
    },

    bank: bank
      ? {
          accountName: bank.accountName,
          bankName: bank.bankName,
          branch: bank.branch,
          branchCode: bank.branchCode,
          accountNumber: bank.accountNumber,
          currency: bank.currency,
          swiftCode: bank.swiftCode,
          sortCode: bank.sortCode,
        }
      : null,

    title: doc.title,
    scopeLine: doc.scopeDescription
      ? `${doc.scopeDescription}${doc.servicePeriodLabel ? ` — ${doc.servicePeriodLabel}` : ''}`
      : doc.servicePeriodLabel,
    clientReference: doc.clientReference,
    purchaseOrderNumber: po?.poNumber ?? null,

    lines: lines.map((l) => ({
      position: l.position,
      description: l.description,
      itemCode: l.itemCode,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      lineTotal: l.lineTotal,
    })),

    totals:
      doc.grandTotal != null
        ? {
            subTotal: doc.subTotal ?? '0',
            charges: charges.map((c) => ({
              label: c.label,
              ratePercent: c.ratePercent,
              amount: c.amount,
              appliesBeforeVat: c.appliesBeforeVat,
            })),
            taxableTotal: doc.taxableTotal ?? '0',
            taxLabel: doc.taxLabel,
            taxRatePercent: doc.taxRatePercent,
            taxAmount: doc.taxAmount ?? '0',
            grandTotal: doc.grandTotal,
            currency: doc.currency,
          }
        : null,

    bodyContent: doc.bodyContent,
    terms: (doc.terms as RenderDocument['terms']) ?? null,

    preparedBy: preparer
      ? {
          name: preparer.fullName,
          title: preparer.jobTitle,
          phone: preparer.phone,
          email: preparer.email,
        }
      : null,

    logo,
    partnerMarks,
    seals,

    footer: {
      tagline: brandPayload.footer?.tagline ?? null,
      directorsLine: brandPayload.directorsLine ?? null,
      showFooter: layout.showFooter && Boolean(brandPayload.footer?.tagline),
    },

    fontSubstitutionNotice: font.isLicensedCenturyGothic ? null : font.substitutionNotice,
    isDraft,
    watermark: options.watermark ?? (isDraft ? 'DRAFT' : null),
  }

  return { model, warnings }
}
