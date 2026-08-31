import 'server-only'

import { and, eq, isNull, or, sql } from 'drizzle-orm'
import type { Database } from '@/db/client'
import {
  bankAccounts,
  chargeRules,
  entityAddresses,
  legalEntities,
  roundingPolicies,
  taxRules,
} from '@/db/schema'
import { AppError } from '@/lib/errors'
import type { ChargeRuleInput, RoundingPolicy, TaxRuleInput } from './totals'

/**
 * Loads the approved configuration a document is priced against.
 *
 * Only rows in the `approved` state are ever returned. A draft rate is inert by
 * construction — this is the code path that makes "nothing extracted from a
 * historical document is active until an Administrator approves it" true in
 * practice rather than in principle.
 *
 * Every value the finance engine uses arrives through here. There is no rate
 * literal anywhere in the calculation code.
 */

export interface DocumentConfig {
  legalEntity: {
    id: string
    name: string
    tin: string | null
    vrn: string | null
    registrationNumber: string | null
    businessLicence: string | null
    importExportLicence: string | null
  }
  address: {
    id: string
    label: string
    lines: string[]
    city: string | null
    country: string
    phone: string | null
    alternatePhone: string | null
    whatsapp: string | null
    email: string | null
    website: string | null
  } | null
  bankAccount: {
    id: string
    currency: string
    accountName: string
    bankName: string
    branch: string | null
    branchCode: string | null
    accountNumber: string
    swiftCode: string | null
    sortCode: string | null
  } | null
  charges: ChargeRuleInput[]
  tax: TaxRuleInput | null
  rounding: RoundingPolicy
  currency: string
}

/** What is missing before a document of this type can be priced or issued. */
export interface ConfigReadiness {
  ready: boolean
  missing: string[]
  warnings: string[]
}

const DEFAULT_ROUNDING: RoundingPolicy = {
  decimalPlaces: 2,
  mode: 'half_up',
  roundAtStep: 'line_total',
}

/**
 * Reports what still needs approving.
 *
 * Used to keep the "create document" controls honest: rather than letting a
 * Technical Officer build a quotation and discover at approval time that the
 * company has no approved VAT rate, the gap is shown before they start.
 */
export async function checkConfigReadiness(
  db: Database,
  documentType: string,
  currency = 'TZS',
): Promise<ConfigReadiness> {
  const missing: string[] = []
  const warnings: string[] = []

  const [entity] = await db
    .select({ id: legalEntities.id, name: legalEntities.name, tin: legalEntities.tin })
    .from(legalEntities)
    .where(and(eq(legalEntities.state, 'approved'), eq(legalEntities.isDefault, true)))
    .limit(1)

  if (!entity) {
    missing.push(
      'An approved legal entity. Phase 0 found the company name printed three different ways ' +
        'across the sample documents — one must be confirmed before anything is issued.',
    )
  } else if (!entity.tin) {
    warnings.push('The approved legal entity has no TIN recorded.')
  }

  const [rounding] = await db
    .select({ id: roundingPolicies.id })
    .from(roundingPolicies)
    .where(and(eq(roundingPolicies.state, 'approved'), eq(roundingPolicies.currency, currency)))
    .limit(1)

  if (!rounding) {
    missing.push(`An approved rounding policy for ${currency}.`)
  }

  // Tax documents carry statutory weight; the rest can be produced without a
  // tax rate, so the requirement is scoped rather than blanket.
  const taxable = documentType === 'tax_invoice' || documentType === 'quotation'
  if (taxable) {
    const [tax] = await db
      .select({ id: taxRules.id })
      .from(taxRules)
      .where(
        and(
          eq(taxRules.state, 'approved'),
          or(isNull(taxRules.documentType), eq(taxRules.documentType, documentType as never)),
        ),
      )
      .limit(1)

    if (!tax) {
      missing.push('An approved VAT rate. The 18% seen on the sample documents is still a draft.')
    }
  }

  if (documentType === 'tax_invoice') {
    const [bank] = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.state, 'approved'), eq(bankAccounts.currency, currency)))
      .limit(1)

    if (!bank) {
      missing.push(`An approved ${currency} bank account. Tax invoices print banking details.`)
    }
  }

  // Raw SQL for the enum cast; the value is still parameterised.
  const numberingResult = await db.execute(
    sql`select id from public.numbering_rules
        where document_type = ${documentType}::public.document_type
          and state = 'approved'
        limit 1`,
  )

  if (numberingResult.rows.length === 0) {
    missing.push(
      `An approved numbering rule for this document type. The historical form (HQ_2670053) and ` +
        `the form named in the master brief (HA/QTN/2026/00145) are both drafts and they conflict.`,
    )
  }

  return { ready: missing.length === 0, missing, warnings }
}

/**
 * Loads the full configuration for pricing a document.
 *
 * Throws rather than falling back to a default. A silently assumed VAT rate on
 * a tax invoice is exactly the failure this platform exists to prevent.
 */
export async function loadDocumentConfig(
  db: Database,
  documentType: string,
  currency = 'TZS',
): Promise<DocumentConfig> {
  const [entity] = await db
    .select()
    .from(legalEntities)
    .where(and(eq(legalEntities.state, 'approved'), eq(legalEntities.isDefault, true)))
    .limit(1)

  if (!entity) {
    throw new AppError(
      'No approved legal entity has been set. An Administrator must approve the company details ' +
        'in Company settings before documents can be produced.',
      'config_incomplete',
      409,
    )
  }

  const [address] = await db
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

  const [bank] = await db
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.legalEntityId, entity.id),
        eq(bankAccounts.state, 'approved'),
        eq(bankAccounts.currency, currency),
      ),
    )
    .limit(1)

  const [rounding] = await db
    .select()
    .from(roundingPolicies)
    .where(and(eq(roundingPolicies.state, 'approved'), eq(roundingPolicies.currency, currency)))
    .limit(1)

  if (!rounding) {
    throw new AppError(
      `No approved rounding policy exists for ${currency}. Rounding must be an explicit decision ` +
        'before any figure is issued.',
      'config_incomplete',
      409,
    )
  }

  const charges = await db
    .select()
    .from(chargeRules)
    .where(
      and(
        eq(chargeRules.state, 'approved'),
        or(isNull(chargeRules.documentType), eq(chargeRules.documentType, documentType as never)),
      ),
    )

  const [tax] = await db
    .select()
    .from(taxRules)
    .where(
      and(
        eq(taxRules.state, 'approved'),
        or(isNull(taxRules.documentType), eq(taxRules.documentType, documentType as never)),
      ),
    )
    .limit(1)

  return {
    legalEntity: {
      id: entity.id,
      name: entity.name,
      tin: entity.tin,
      vrn: entity.vrn,
      registrationNumber: entity.registrationNumber,
      businessLicence: entity.businessLicence,
      importExportLicence: entity.importExportLicence,
    },
    address: address
      ? {
          id: address.id,
          label: address.label,
          lines: [address.addressLine1, address.addressLine2, address.addressLine3].filter(
            (l): l is string => Boolean(l),
          ),
          city: address.city,
          country: address.country,
          phone: address.phone,
          alternatePhone: address.alternatePhone,
          whatsapp: address.whatsapp,
          email: address.email,
          website: address.website,
        }
      : null,
    bankAccount: bank
      ? {
          id: bank.id,
          currency: bank.currency,
          accountName: bank.accountName,
          bankName: bank.bankName,
          branch: bank.branch,
          branchCode: bank.branchCode,
          accountNumber: bank.accountNumber,
          swiftCode: bank.swiftCode,
          sortCode: bank.sortCode,
        }
      : null,
    charges: charges.map((c) => ({
      code: c.code,
      label: c.label,
      ratePercent: c.ratePercent,
      appliesBeforeVat: c.appliesBeforeVat,
      position: c.position,
    })),
    tax: tax ? { code: tax.code, label: tax.label, ratePercent: tax.ratePercent } : null,
    rounding: {
      decimalPlaces: rounding.decimalPlaces,
      mode: rounding.mode,
      roundAtStep: rounding.roundAtStep,
    },
    currency,
  }
}

export { DEFAULT_ROUNDING }
