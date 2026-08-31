import { describe, expect, it } from 'vitest'
import { Decimal, formatAmount } from '@/lib/finance/decimal'
import {
  computeDocumentTotals,
  foldChargesIntoUnitPrices,
  verifyTotals,
  type RoundingPolicy,
} from '@/lib/finance/totals'

/**
 * The calculation engine, tested against HA GROUP's own documents.
 *
 * The sample quotations and invoices from Phase 0 are the specification here.
 * If the engine cannot reproduce a real HA GROUP invoice to the cent, it is
 * wrong, whatever a synthetic test says.
 */

const TZS: RoundingPolicy = { decimalPlaces: 2, mode: 'half_up', roundAtStep: 'line_total' }
const VAT = { code: 'VAT', label: 'VAT', ratePercent: '18' }
const ADMIN = {
  code: 'ADMIN',
  label: 'Administration',
  ratePercent: '20',
  appliesBeforeVat: true,
  position: 1,
}

describe('Decimal', () => {
  it('holds values a float cannot', () => {
    expect(Decimal.from('0.1').add(Decimal.from('0.2')).toFixed(2)).toBe('0.30')
    // The canonical float failure: 0.1 + 0.2 === 0.30000000000000004
    expect(Decimal.from('0.1').add(Decimal.from('0.2')).equals(Decimal.from('0.3'))).toBe(true)
  })

  it('refuses input that is not a decimal', () => {
    expect(() => Decimal.from('abc')).toThrow()
    expect(() => Decimal.from('1.2.3')).toThrow()
    expect(() => Decimal.from('')).toThrow()
    expect(() => Decimal.from(Number.NaN)).toThrow()
    expect(() => Decimal.from(Number.POSITIVE_INFINITY)).toThrow()
  })

  it('multiplies large money values exactly', () => {
    // 13 × 2,221,976.50 — the extension Phase 0 found wrong on HQ_2670052.
    expect(Decimal.from('13').multiply(Decimal.from('2221976.50')).toFixed(2)).toBe('28885694.50')
  })

  it('rounds half-up away from zero', () => {
    expect(Decimal.from('2.345').round(2, 'half_up').toFixed(2)).toBe('2.35')
    expect(Decimal.from('-2.345').round(2, 'half_up').toFixed(2)).toBe('-2.35')
  })

  it('rounds half-even to the even neighbour', () => {
    expect(Decimal.from('2.345').round(2, 'half_even').toFixed(2)).toBe('2.34')
    expect(Decimal.from('2.355').round(2, 'half_even').toFixed(2)).toBe('2.36')
  })

  it('rounds half-down, floor and ceil as named', () => {
    expect(Decimal.from('2.345').round(2, 'half_down').toFixed(2)).toBe('2.34')
    expect(Decimal.from('2.341').round(2, 'floor').toFixed(2)).toBe('2.34')
    expect(Decimal.from('2.341').round(2, 'ceil').toFixed(2)).toBe('2.35')
    expect(Decimal.from('-2.341').round(2, 'floor').toFixed(2)).toBe('-2.35')
    expect(Decimal.from('-2.341').round(2, 'ceil').toFixed(2)).toBe('-2.34')
  })

  it('never produces scientific notation, however large', () => {
    const huge = Decimal.from('123456789012345.67')
    expect(huge.toFixed(2)).toBe('123456789012345.67')
    expect(huge.toFixed(2)).not.toMatch(/e/i)
  })

  it('formats with thousands separators for display', () => {
    expect(formatAmount(Decimal.from('20995467.70'))).toBe('20,995,467.70')
    expect(formatAmount(Decimal.from('-1234.5'))).toBe('-1,234.50')
    expect(formatAmount(Decimal.from('999'))).toBe('999.00')
  })

  it('refuses to divide by zero', () => {
    expect(() => Decimal.from('1').divide(Decimal.ZERO)).toThrow(RangeError)
  })
})

describe('quotation ladder — reproducing HQ_2670053', () => {
  /**
   * The real document:
   *   1 × 8 × 1,853,413.46  line total 14,827,307.70 (as printed)
   *   SUB TOTAL             14,827,307.70
   *   Administration (20%)   2,965,461.54
   *   TOTAL                 17,792,769.24
   *   VAT (18%)              3,202,698.46
   *   TOTAL INCL            20,995,467.70
   */
  const result = computeDocumentTotals({
    currency: 'TZS',
    lines: [
      { description: 'July 2026 Maintenance Services', quantity: '8', unitPrice: '1853413.46' },
    ],
    charges: [ADMIN],
    tax: VAT,
    rounding: TZS,
  })

  it('computes the line extension exactly', () => {
    // 8 × 1,853,413.46 = 14,827,307.68. The document printed ...70, which is
    // two cents adrift — an error in the original, not in this engine.
    expect(result.lines[0]!.lineTotal).toBe('14827307.68')
  })

  it('applies administration before VAT', () => {
    expect(result.subTotal).toBe('14827307.68')
    expect(result.charges[0]!.amount).toBe('2965461.54')
    expect(result.charges[0]!.appliesBeforeVat).toBe(true)
    expect(result.taxableTotal).toBe('17792769.22')
  })

  it('reaches the document total within the two cents the original was out by', () => {
    expect(result.taxAmount).toBe('3202698.46')
    expect(result.grandTotal).toBe('20995467.68')

    const printed = Decimal.from('20995467.70')
    const drift = Decimal.from(result.grandTotal).subtract(printed)
    expect(drift.toFixed(2)).toBe('-0.02')
  })

  it('matches the document exactly when given the document’s own stated sub total', () => {
    // Feeding the printed line total back in reproduces the rest of the ladder
    // to the cent, which confirms the ladder itself is right and the only
    // discrepancy is the original extension.
    const fromStated = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'Stated', quantity: '1', unitPrice: '14827307.70' }],
      charges: [ADMIN],
      tax: VAT,
      rounding: TZS,
    })

    expect(fromStated.subTotal).toBe('14827307.70')
    expect(fromStated.charges[0]!.amount).toBe('2965461.54')
    expect(fromStated.taxableTotal).toBe('17792769.24')
    expect(fromStated.taxAmount).toBe('3202698.46')
    expect(fromStated.grandTotal).toBe('20995467.70')
  })
})

describe('the arithmetic error in HQ_2670052', () => {
  it('shows the printed quantity and the printed extension disagree', () => {
    // The document states qty 13 at 2,221,976.50 giving 26,663,717.95.
    const asPrinted = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'June 2026 Associated Overtime', quantity: '13', unitPrice: '2221976.50' }],
      charges: [],
      tax: null,
      rounding: TZS,
    })
    expect(asPrinted.subTotal).toBe('28885694.50')

    const printed = Decimal.from('26663717.95')
    const shortfall = Decimal.from(asPrinted.subTotal).subtract(printed)
    expect(shortfall.toFixed(2)).toBe('2221976.55')
  })

  it('shows the printed extension is consistent with a quantity of 12', () => {
    const atTwelve = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'June 2026 Associated Overtime', quantity: '12', unitPrice: '2221976.50' }],
      charges: [],
      tax: null,
      rounding: TZS,
    })
    expect(atTwelve.subTotal).toBe('26663718.00')

    const drift = Decimal.from(atTwelve.subTotal).subtract(Decimal.from('26663717.95'))
    expect(drift.toFixed(2)).toBe('0.05')
  })

  it('would have caught the error at entry, because the engine extends the quantity itself', () => {
    // A Technical Officer cannot type a line total in this platform. It is
    // always quantity × unit price, so this class of error cannot recur.
    const line = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'x', quantity: '13', unitPrice: '2221976.50' }],
      charges: [],
      tax: null,
      rounding: TZS,
    }).lines[0]!

    expect(line.lineTotal).not.toBe('26663717.95')
  })
})

describe('invoice ladder — reproducing HI_2670053', () => {
  it('matches the real invoice to the cent', () => {
    // TOTAL 43,378,362.99 · VAT 18% 7,808,105.34 · GRAND TOTAL 51,186,468.33
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines: [
        { description: 'MAINTANCE SERVICES ( JUNE 2026 )', quantity: '1', unitPrice: '43378362.99' },
      ],
      charges: [],
      tax: VAT,
      rounding: TZS,
    })

    expect(result.subTotal).toBe('43378362.99')
    expect(result.taxAmount).toBe('7808105.34')
    expect(result.grandTotal).toBe('51186468.33')
  })

  it('matches HI_2670050, a materials invoice', () => {
    // 12 × RED RIBON 500M @ 138,240.00 → 1,658,880.00, VAT 298,598.40, 1,957,478.40
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'RED RIBON 500M', quantity: '12', unitPrice: '138240.00' }],
      charges: [],
      tax: VAT,
      rounding: TZS,
    })

    expect(result.subTotal).toBe('1658880.00')
    expect(result.taxAmount).toBe('298598.40')
    expect(result.grandTotal).toBe('1957478.40')
  })

  it('matches HI_2670051', () => {
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'MAINTANCE SUPPORT ( MAY 2026 )', quantity: '1', unitPrice: '82012246.15' }],
      charges: [],
      tax: VAT,
      rounding: TZS,
    })

    expect(result.taxAmount).toBe('14762204.31')
    expect(result.grandTotal).toBe('96774450.46')
  })
})

describe('quotation to invoice — the HQ_2670053 → HI_2670052 bridge', () => {
  /**
   * The conversion is NOT unit cost × 1.20. That yields 2,224,096.152, which
   * rounds to .15. The real invoice prints .16, and the derivation that
   * produces it is the loaded LINE TOTAL divided by the quantity:
   *
   *     14,827,307.70 × 1.20 = 17,792,769.24
   *     17,792,769.24 ÷ 8    =  2,224,096.155  →  2,224,096.16
   */

  // Built from the quotation's own PRINTED sub total, so the comparison is
  // against exactly what HA GROUP had in front of them.
  const asPrinted = computeDocumentTotals({
    currency: 'TZS',
    lines: [{ description: 'July 2026 Maintenance Services', quantity: '8', unitPrice: '1853413.4625' }],
    charges: [ADMIN],
    tax: VAT,
    rounding: TZS,
  })

  it('starts from the sub total the quotation printed', () => {
    expect(asPrinted.subTotal).toBe('14827307.70')
    expect(asPrinted.taxableTotal).toBe('17792769.24')
  })

  it('derives the exact unit price the real invoice printed', () => {
    const folded = foldChargesIntoUnitPrices(asPrinted, VAT)
    expect(folded.loadingFactorPercent).toBe('20')
    expect(folded.lines[0]!.unitPrice).toBe('2224096.16')
  })

  it('reproduces the real invoice to the cent', () => {
    const folded = foldChargesIntoUnitPrices(asPrinted, VAT)
    const invoice = computeDocumentTotals({
      currency: 'TZS',
      lines: folded.lines,
      charges: [],
      tax: VAT,
      rounding: TZS,
    })

    // HI_2670052 printed: TOTAL 17,792,769.28 · VAT 3,202,698.47 · 20,995,467.75
    expect(invoice.subTotal).toBe('17792769.28')
    expect(invoice.taxAmount).toBe('3202698.47')
    expect(invoice.grandTotal).toBe('20995467.75')
  })

  it('reports the rounding drift rather than hiding it', () => {
    const folded = foldChargesIntoUnitPrices(asPrinted, VAT)
    // Rounding the derived unit price and multiplying back does not return the
    // loaded total exactly. The Technical Officer sees this before approving.
    expect(folded.difference).not.toBe('0.00')
  })

  it('produces a different, arithmetically correct total from correct inputs', () => {
    // The same job priced without the original's two-cent extension error.
    // The engine cannot reproduce the printed invoice here, and should not:
    // the printed invoice inherited an error from its quotation.
    const corrected = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'July 2026 Maintenance Services', quantity: '8', unitPrice: '1853413.46' }],
      charges: [ADMIN],
      tax: VAT,
      rounding: TZS,
    })

    const folded = foldChargesIntoUnitPrices(corrected, VAT)
    expect(folded.lines[0]!.unitPrice).toBe('2224096.15')

    const invoice = computeDocumentTotals({
      currency: 'TZS',
      lines: folded.lines,
      charges: [],
      tax: VAT,
      rounding: TZS,
    })

    expect(invoice.subTotal).toBe('17792769.20')
    expect(invoice.grandTotal).toBe('20995467.66')

    // Nine cents below the historical document, all of it traceable to the
    // original extension.
    const gap = Decimal.from('20995467.75').subtract(Decimal.from(invoice.grandTotal))
    expect(gap.toFixed(2)).toBe('0.09')
  })

  it('carries a per-line discount into the loaded price without double-counting it', () => {
    const discounted = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'x', quantity: '10', unitPrice: '100', discountPercent: '10' }],
      charges: [ADMIN],
      tax: null,
      rounding: TZS,
    })
    expect(discounted.subTotal).toBe('900.00')

    const folded = foldChargesIntoUnitPrices(discounted, null)
    // 900 × 1.2 = 1080; ÷ 10 = 108. The discount is already inside the 900.
    expect(folded.lines[0]!.unitPrice).toBe('108.00')
    expect(folded.lines[0]!.discountPercent).toBeNull()

    const invoice = computeDocumentTotals({
      currency: 'TZS',
      lines: folded.lines,
      charges: [],
      tax: null,
      rounding: TZS,
    })
    expect(invoice.grandTotal).toBe('1080.00')
  })
})

describe('rates come from configuration, never from code', () => {
  it('produces no tax when no tax rule is supplied', () => {
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'x', quantity: '1', unitPrice: '100' }],
      charges: [],
      tax: null,
      rounding: TZS,
    })
    expect(result.taxAmount).toBe('0.00')
    expect(result.taxRatePercent).toBeNull()
    expect(result.grandTotal).toBe('100.00')
  })

  it('honours a different VAT rate without any code change', () => {
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'x', quantity: '1', unitPrice: '1000' }],
      charges: [],
      tax: { code: 'VAT', label: 'VAT', ratePercent: '15' },
      rounding: TZS,
    })
    expect(result.taxAmount).toBe('150.00')
  })

  it('honours a different administration rate', () => {
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'x', quantity: '1', unitPrice: '1000' }],
      charges: [{ ...ADMIN, ratePercent: '12.5' }],
      tax: null,
      rounding: TZS,
    })
    expect(result.charges[0]!.amount).toBe('125.00')
    expect(result.grandTotal).toBe('1125.00')
  })

  it('applies a post-VAT charge after the tax, not before', () => {
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'x', quantity: '1', unitPrice: '1000' }],
      charges: [
        { code: 'LATE', label: 'Late fee', ratePercent: '10', appliesBeforeVat: false, position: 1 },
      ],
      tax: VAT,
      rounding: TZS,
    })

    expect(result.taxableTotal).toBe('1000.00')
    expect(result.taxAmount).toBe('180.00')
    expect(result.chargesAfterVat).toBe('100.00')
    expect(result.grandTotal).toBe('1280.00')
  })

  it('applies charges in configured position order', () => {
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'x', quantity: '1', unitPrice: '1000' }],
      charges: [
        { code: 'B', label: 'Second', ratePercent: '5', appliesBeforeVat: true, position: 2 },
        { code: 'A', label: 'First', ratePercent: '10', appliesBeforeVat: true, position: 1 },
      ],
      tax: null,
      rounding: TZS,
    })

    expect(result.charges.map((c) => c.code)).toEqual(['A', 'B'])
    expect(result.taxableTotal).toBe('1150.00')
  })
})

describe('rounding policy changes the answer, and is recorded', () => {
  const lines = [{ description: 'x', quantity: '3', unitPrice: '10.005' }]

  it('rounding at unit price differs from rounding at line total', () => {
    const atUnit = computeDocumentTotals({
      currency: 'TZS',
      lines,
      charges: [],
      tax: null,
      rounding: { decimalPlaces: 2, mode: 'half_up', roundAtStep: 'unit_price' },
    })
    const atLine = computeDocumentTotals({
      currency: 'TZS',
      lines,
      charges: [],
      tax: null,
      rounding: { decimalPlaces: 2, mode: 'half_up', roundAtStep: 'line_total' },
    })

    // 3 × 10.01 = 30.03 versus 3 × 10.005 = 30.015 → 30.02
    expect(atUnit.grandTotal).toBe('30.03')
    expect(atLine.grandTotal).toBe('30.02')
    expect(atUnit.grandTotal).not.toBe(atLine.grandTotal)
  })

  it('stores the policy that produced the figures', () => {
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines,
      charges: [],
      tax: null,
      rounding: { decimalPlaces: 2, mode: 'half_even', roundAtStep: 'subtotal' },
    })
    expect(result.rounding).toEqual({
      decimalPlaces: 2,
      mode: 'half_even',
      roundAtStep: 'subtotal',
    })
  })

  it('supports a zero-decimal currency', () => {
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'x', quantity: '3', unitPrice: '1000.60' }],
      charges: [],
      tax: null,
      rounding: { decimalPlaces: 0, mode: 'half_up', roundAtStep: 'line_total' },
    })
    expect(result.grandTotal).toBe('3002')
  })
})

describe('discounts', () => {
  it('applies a per-line percentage before the line total', () => {
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines: [{ description: 'x', quantity: '10', unitPrice: '100', discountPercent: '15' }],
      charges: [],
      tax: null,
      rounding: TZS,
    })

    expect(result.lines[0]!.discountAmount).toBe('150.00')
    expect(result.lines[0]!.lineTotal).toBe('850.00')
  })

  it('refuses a discount outside 0–100', () => {
    expect(() =>
      computeDocumentTotals({
        currency: 'TZS',
        lines: [{ description: 'x', quantity: '1', unitPrice: '100', discountPercent: '150' }],
        charges: [],
        tax: null,
        rounding: TZS,
      }),
    ).toThrow(RangeError)
  })
})

describe('input guards', () => {
  it('refuses a negative quantity', () => {
    expect(() =>
      computeDocumentTotals({
        currency: 'TZS',
        lines: [{ description: 'bad', quantity: '-1', unitPrice: '100' }],
        charges: [],
        tax: null,
        rounding: TZS,
      }),
    ).toThrow(/Quantity cannot be negative/)
  })

  it('refuses a negative unit price', () => {
    expect(() =>
      computeDocumentTotals({
        currency: 'TZS',
        lines: [{ description: 'bad', quantity: '1', unitPrice: '-100' }],
        charges: [],
        tax: null,
        rounding: TZS,
      }),
    ).toThrow(/Unit price cannot be negative/)
  })

  it('refuses a negative tax rate', () => {
    expect(() =>
      computeDocumentTotals({
        currency: 'TZS',
        lines: [{ description: 'x', quantity: '1', unitPrice: '100' }],
        charges: [],
        tax: { code: 'VAT', label: 'VAT', ratePercent: '-18' },
        rounding: TZS,
      }),
    ).toThrow(/negative rate/)
  })

  it('handles an empty document without dividing by zero', () => {
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines: [],
      charges: [ADMIN],
      tax: VAT,
      rounding: TZS,
    })
    expect(result.subTotal).toBe('0.00')
    expect(result.grandTotal).toBe('0.00')
  })
})

describe('stored totals can be re-verified', () => {
  const recomputed = computeDocumentTotals({
    currency: 'TZS',
    lines: [{ description: 'x', quantity: '1', unitPrice: '43378362.99' }],
    charges: [],
    tax: VAT,
    rounding: TZS,
  })

  it('confirms a document that still adds up', () => {
    const check = verifyTotals(
      { subTotal: '43378362.99', taxAmount: '7808105.34', grandTotal: '51186468.33' },
      recomputed,
    )
    expect(check.matches).toBe(true)
    expect(check.differences).toEqual([])
  })

  it('reports a document whose stored figures no longer match', () => {
    const check = verifyTotals(
      { subTotal: '43378362.99', taxAmount: '7808105.34', grandTotal: '99999999.99' },
      recomputed,
    )
    expect(check.matches).toBe(false)
    expect(check.differences[0]).toMatch(/Grand total/)
  })
})

describe('many lines', () => {
  it('sums a large document without drift', () => {
    // 1,000 lines of 0.01 must total exactly 10.00, not 9.99 or 10.000000001.
    const result = computeDocumentTotals({
      currency: 'TZS',
      lines: Array.from({ length: 1000 }, (_, i) => ({
        description: `Line ${i + 1}`,
        quantity: '1',
        unitPrice: '0.01',
      })),
      charges: [],
      tax: null,
      rounding: TZS,
    })

    expect(result.subTotal).toBe('10.00')
    expect(result.grandTotal).toBe('10.00')
  })
})
