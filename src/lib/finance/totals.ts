import { Decimal, type RoundingMode } from './decimal'

/**
 * The document calculation engine.
 *
 * This is the only place in the platform that decides what a document totals.
 * AI never touches it. Every rate it uses is passed in from approved
 * configuration — there is no `0.18` or `0.20` anywhere in this file, because
 * Phase 0 showed both rates are attested by a single client in a single month
 * and cannot be treated as company-wide.
 *
 * The ladder reproduces what HA GROUP's own documents do:
 *
 *   sub total       = Σ line totals
 *   charges         = each configured charge, applied in position order
 *   total           = sub total + charges that apply before VAT
 *   VAT             = total × VAT rate
 *   grand total     = total + VAT + charges that apply after VAT
 *
 * Order matters and is not cosmetic. On the sample quotations the 20%
 * administration charge is added *before* VAT is computed; applying it after
 * would understate the tax.
 */

export interface RoundingPolicy {
  decimalPlaces: number
  mode: RoundingMode
  /**
   * Where rounding is applied. Everything before this point keeps full
   * precision. Phase 0 traced a TZS 0.05 discrepancy between a quotation and
   * its invoice to rounding at `unit_price`, which is why this is an explicit,
   * approved choice rather than a default.
   */
  roundAtStep: 'unit_price' | 'line_total' | 'subtotal' | 'grand_total'
}

export interface ChargeRuleInput {
  code: string
  label: string
  /** Percentage, e.g. "20" for 20%. From approved configuration. */
  ratePercent: string
  appliesBeforeVat: boolean
  position: number
}

export interface TaxRuleInput {
  code: string
  label: string
  /** Percentage, e.g. "18" for 18%. From approved configuration. */
  ratePercent: string
}

export interface LineInput {
  description: string
  /** Decimal string. Quantities may be fractional (hours, metres). */
  quantity: string
  unitPrice: string
  /** Optional per-line discount percentage. */
  discountPercent?: string | null
}

export interface ComputedLine {
  description: string
  quantity: string
  unitPrice: string
  /** unitPrice after any rounding at the unit-price step. */
  effectiveUnitPrice: string
  discountPercent: string | null
  discountAmount: string
  lineTotal: string
}

export interface ComputedCharge {
  code: string
  label: string
  ratePercent: string
  appliesBeforeVat: boolean
  amount: string
}

export interface DocumentTotals {
  currency: string
  lines: ComputedLine[]
  charges: ComputedCharge[]
  subTotal: string
  chargesBeforeVat: string
  chargesAfterVat: string
  /** Sub total plus pre-VAT charges. The base VAT is computed on. */
  taxableTotal: string
  taxCode: string | null
  taxLabel: string | null
  taxRatePercent: string | null
  taxAmount: string
  grandTotal: string
  /** The exact policy applied, stored with the document so a total is reproducible. */
  rounding: RoundingPolicy
}

export interface ComputeInput {
  currency: string
  lines: LineInput[]
  charges: ChargeRuleInput[]
  tax: TaxRuleInput | null
  rounding: RoundingPolicy
}

function roundIf(value: Decimal, active: boolean, policy: RoundingPolicy): Decimal {
  return active ? value.round(policy.decimalPlaces, policy.mode) : value
}

export function computeDocumentTotals(input: ComputeInput): DocumentTotals {
  const { rounding } = input
  const places = rounding.decimalPlaces

  const roundAtUnit = rounding.roundAtStep === 'unit_price'
  const roundAtLine = roundAtUnit || rounding.roundAtStep === 'line_total'
  const roundAtSub = roundAtLine || rounding.roundAtStep === 'subtotal'

  const lines: ComputedLine[] = []
  let subTotal = Decimal.ZERO

  for (const line of input.lines) {
    const quantity = Decimal.from(line.quantity)
    const rawUnitPrice = Decimal.from(line.unitPrice)

    if (quantity.isNegative()) {
      throw new RangeError(`Quantity cannot be negative on line "${line.description}"`)
    }
    if (rawUnitPrice.isNegative()) {
      throw new RangeError(`Unit price cannot be negative on line "${line.description}"`)
    }

    const unitPrice = roundIf(rawUnitPrice, roundAtUnit, rounding)

    const gross = quantity.multiply(unitPrice)

    const discountPercent = line.discountPercent ? Decimal.from(line.discountPercent) : null
    if (
      discountPercent &&
      (discountPercent.isNegative() || discountPercent.compare(Decimal.from(100)) > 0)
    ) {
      throw new RangeError(`Discount must be between 0 and 100 on line "${line.description}"`)
    }

    const discountAmount = discountPercent ? gross.percentOf(discountPercent) : Decimal.ZERO
    const net = gross.subtract(discountAmount)
    const lineTotal = roundIf(net, roundAtLine, rounding)

    lines.push({
      description: line.description,
      quantity: quantity.toString(),
      unitPrice: rawUnitPrice.toFixed(places),
      effectiveUnitPrice: unitPrice.toFixed(places),
      discountPercent: discountPercent ? discountPercent.toString() : null,
      discountAmount: discountAmount.toFixed(places),
      lineTotal: lineTotal.toFixed(places),
    })

    subTotal = subTotal.add(lineTotal)
  }

  subTotal = roundIf(subTotal, roundAtSub, rounding)

  // Charges apply to the sub total, in the order configuration gives them.
  const ordered = [...input.charges].sort((a, b) => a.position - b.position)

  const charges: ComputedCharge[] = []
  let chargesBeforeVat = Decimal.ZERO
  let chargesAfterVat = Decimal.ZERO

  for (const charge of ordered) {
    const rate = Decimal.from(charge.ratePercent)
    if (rate.isNegative()) {
      throw new RangeError(`Charge "${charge.code}" has a negative rate`)
    }

    const amount = roundIf(subTotal.percentOf(rate), roundAtSub, rounding)

    charges.push({
      code: charge.code,
      label: charge.label,
      ratePercent: rate.toString(),
      appliesBeforeVat: charge.appliesBeforeVat,
      amount: amount.toFixed(places),
    })

    if (charge.appliesBeforeVat) {
      chargesBeforeVat = chargesBeforeVat.add(amount)
    } else {
      chargesAfterVat = chargesAfterVat.add(amount)
    }
  }

  const taxableTotal = subTotal.add(chargesBeforeVat)

  let taxAmount = Decimal.ZERO
  if (input.tax) {
    const rate = Decimal.from(input.tax.ratePercent)
    if (rate.isNegative()) {
      throw new RangeError(`Tax "${input.tax.code}" has a negative rate`)
    }
    taxAmount = taxableTotal.percentOf(rate).round(places, rounding.mode)
  }

  const grandTotal = taxableTotal.add(taxAmount).add(chargesAfterVat).round(places, rounding.mode)

  return {
    currency: input.currency,
    lines,
    charges,
    subTotal: subTotal.toFixed(places),
    chargesBeforeVat: chargesBeforeVat.toFixed(places),
    chargesAfterVat: chargesAfterVat.toFixed(places),
    taxableTotal: taxableTotal.toFixed(places),
    taxCode: input.tax?.code ?? null,
    taxLabel: input.tax?.label ?? null,
    taxRatePercent: input.tax ? Decimal.from(input.tax.ratePercent).toString() : null,
    taxAmount: taxAmount.toFixed(places),
    grandTotal: grandTotal.toFixed(places),
    rounding,
  }
}

/**
 * Folds pre-VAT charges into unit prices — the quotation-to-invoice conversion
 * Phase 0 uncovered.
 *
 * On HQ_2670053 the unit cost is 1,853,413.46 with a 20% administration line.
 * On the matching invoice HI_2670052 the administration line is gone and the
 * unit price is 2,224,096.16.
 *
 * The derivation is NOT unit cost × 1.20. That gives 2,224,096.152, which
 * rounds to .15. It is the loaded LINE TOTAL divided by the quantity:
 *
 *     17,792,769.24 ÷ 8 = 2,224,096.155  →  2,224,096.16
 *
 * The distinction matters, because only the second reproduces the real invoice.
 * Dividing the loaded total is also the more defensible rule: it keeps the
 * invoice anchored to the figure the client actually approved on the quotation.
 *
 * Rounding the derived unit price and multiplying back by quantity does not
 * always return the loaded total exactly, so the caller is told the difference
 * rather than left to discover it on a tax document.
 */
export interface FoldResult {
  lines: LineInput[]
  loadingFactorPercent: string
  /** Grand total the quotation stated. */
  sourceGrandTotal: string
  /** Grand total the folded invoice produces. */
  foldedGrandTotal: string
  /** foldedGrandTotal − sourceGrandTotal. Non-zero means rounding drift. */
  difference: string
}

export function foldChargesIntoUnitPrices(
  quotation: DocumentTotals,
  tax: TaxRuleInput | null,
): FoldResult {
  const hundred = Decimal.from(100)

  const loading = quotation.charges
    .filter((c) => c.appliesBeforeVat)
    .reduce((acc, c) => acc.add(Decimal.from(c.ratePercent)), Decimal.ZERO)

  const factor = hundred.add(loading).divide(hundred)

  const places = quotation.rounding.decimalPlaces

  const lines: LineInput[] = quotation.lines.map((line) => {
    const quantity = Decimal.from(line.quantity)
    const loadedLineTotal = Decimal.from(line.lineTotal).multiply(factor)

    // Rounded here deliberately: this is the number that prints on the invoice,
    // and an invoice must total what its own printed figures total.
    const unitPrice = quantity.isZero()
      ? Decimal.ZERO
      : loadedLineTotal.divide(quantity).round(places, quotation.rounding.mode)

    return {
      description: line.description,
      quantity: line.quantity,
      unitPrice: unitPrice.toFixed(places),
      // The discount is already inside the loaded line total; re-applying it
      // here would take it twice.
      discountPercent: null,
    }
  })

  const folded = computeDocumentTotals({
    currency: quotation.currency,
    lines,
    charges: [],
    tax,
    rounding: quotation.rounding,
  })

  return {
    lines,
    loadingFactorPercent: loading.toString(),
    sourceGrandTotal: quotation.grandTotal,
    foldedGrandTotal: folded.grandTotal,
    difference: Decimal.from(folded.grandTotal)
      .subtract(Decimal.from(quotation.grandTotal))
      .toFixed(places),
  }
}

/**
 * Recomputes a stored document and reports any disagreement.
 *
 * Used when an approved document is re-rendered or audited: if configuration
 * has changed since, or a stored figure was ever tampered with, this surfaces
 * it rather than silently printing a different number than was approved.
 */
export function verifyTotals(
  stored: Pick<DocumentTotals, 'subTotal' | 'taxAmount' | 'grandTotal'>,
  recomputed: DocumentTotals,
): { matches: boolean; differences: string[] } {
  const differences: string[] = []

  const compare = (label: string, a: string, b: string) => {
    if (!Decimal.from(a).equals(Decimal.from(b))) {
      differences.push(`${label}: stored ${a}, recomputed ${b}`)
    }
  }

  compare('Sub total', stored.subTotal, recomputed.subTotal)
  compare('VAT', stored.taxAmount, recomputed.taxAmount)
  compare('Grand total', stored.grandTotal, recomputed.grandTotal)

  return { matches: differences.length === 0, differences }
}
