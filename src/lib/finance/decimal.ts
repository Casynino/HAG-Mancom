/**
 * Fixed-point decimal arithmetic.
 *
 * Money is never represented as a JavaScript number in this platform. A double
 * cannot hold 0.1 exactly, and Phase 0 already found sub-cent drift in HA
 * GROUP's existing documents; reproducing that class of error in software would
 * be worse than the manual process it replaces.
 *
 * Values are held as a BigInt scaled by 10^SCALE. Every intermediate step keeps
 * full precision, and rounding happens only where the approved rounding policy
 * says it should.
 */

/** Working precision. Well beyond any currency, so intermediates never lose digits. */
const SCALE = 12
const UNIT = 10n ** BigInt(SCALE)

export type RoundingMode = 'half_up' | 'half_even' | 'half_down' | 'floor' | 'ceil'

export class Decimal {
  /** Scaled by 10^SCALE. */
  private readonly raw: bigint

  private constructor(raw: bigint) {
    this.raw = raw
  }

  static readonly ZERO = new Decimal(0n)

  /**
   * Accepts a decimal string, an integer, or a bigint. A JavaScript float is
   * refused unless it is an exact integer: accepting 0.1 here would silently
   * import the very imprecision this class exists to prevent.
   */
  static from(value: string | number | bigint | Decimal): Decimal {
    if (value instanceof Decimal) return value
    if (typeof value === 'bigint') return new Decimal(value * UNIT)

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new TypeError(`Cannot build a Decimal from ${value}`)
      }
      if (!Number.isInteger(value)) {
        // Route through the string form, which is exact for anything a user
        // actually typed.
        return Decimal.from(String(value))
      }
      return new Decimal(BigInt(value) * UNIT)
    }

    const text = value.trim()
    if (!/^-?\d*(\.\d*)?$/.test(text) || text === '' || text === '-' || text === '.') {
      throw new TypeError(`"${value}" is not a valid decimal`)
    }

    const negative = text.startsWith('-')
    const unsigned = negative ? text.slice(1) : text
    const [whole = '0', fraction = ''] = unsigned.split('.')

    // Extra digits beyond the working scale are truncated rather than rounded:
    // rounding is a policy decision and does not belong in a parser.
    const padded = (fraction + '0'.repeat(SCALE)).slice(0, SCALE)
    const raw = BigInt(whole || '0') * UNIT + BigInt(padded || '0')

    return new Decimal(negative ? -raw : raw)
  }

  add(other: Decimal): Decimal {
    return new Decimal(this.raw + other.raw)
  }

  subtract(other: Decimal): Decimal {
    return new Decimal(this.raw - other.raw)
  }

  multiply(other: Decimal): Decimal {
    // Both operands carry SCALE, so the product carries 2×SCALE. Divide once to
    // bring it back, rounding half-up on the discarded digits so the working
    // value stays as close as the representation allows.
    const product = this.raw * other.raw
    return new Decimal(divideRoundHalfUp(product, UNIT))
  }

  divide(other: Decimal): Decimal {
    if (other.raw === 0n) throw new RangeError('Division by zero')
    return new Decimal(divideRoundHalfUp(this.raw * UNIT, other.raw))
  }

  /** Multiplies by a percentage. `percentOf(18)` is 18% of this value. */
  percentOf(percent: Decimal | string | number): Decimal {
    return this.multiply(Decimal.from(percent)).divide(Decimal.from(100))
  }

  negate(): Decimal {
    return new Decimal(-this.raw)
  }

  isZero(): boolean {
    return this.raw === 0n
  }

  isNegative(): boolean {
    return this.raw < 0n
  }

  equals(other: Decimal): boolean {
    return this.raw === other.raw
  }

  compare(other: Decimal): -1 | 0 | 1 {
    if (this.raw < other.raw) return -1
    if (this.raw > other.raw) return 1
    return 0
  }

  /** Rounds to `places` decimals under the given mode. */
  round(places: number, mode: RoundingMode = 'half_up'): Decimal {
    if (places < 0 || places > SCALE || !Number.isInteger(places)) {
      throw new RangeError(`Cannot round to ${places} decimal places`)
    }

    const factor = 10n ** BigInt(SCALE - places)
    if (factor === 1n) return this

    const quotient = this.raw / factor
    const remainder = this.raw % factor

    if (remainder === 0n) return new Decimal(quotient * factor)

    const negative = this.raw < 0n
    const absRemainder = remainder < 0n ? -remainder : remainder
    const twice = absRemainder * 2n

    let adjust = 0n

    switch (mode) {
      case 'half_up':
        if (twice >= factor) adjust = 1n
        break
      case 'half_down':
        if (twice > factor) adjust = 1n
        break
      case 'half_even':
        if (twice > factor) {
          adjust = 1n
        } else if (twice === factor) {
          // Ties go to the even neighbour, which is what keeps a long run of
          // roundings from drifting in one direction.
          const isOdd = (quotient < 0n ? -quotient : quotient) % 2n === 1n
          adjust = isOdd ? 1n : 0n
        }
        break
      case 'floor':
        // Toward negative infinity.
        adjust = negative ? 1n : 0n
        break
      case 'ceil':
        adjust = negative ? 0n : 1n
        break
    }

    const magnitude = (quotient < 0n ? -quotient : quotient) + adjust
    return new Decimal((negative ? -magnitude : magnitude) * factor)
  }

  /** Plain decimal string at `places` decimals. Never scientific notation. */
  toFixed(places = 2): string {
    const rounded = this.round(places, 'half_up')
    const factor = 10n ** BigInt(SCALE - places)
    const scaled = rounded.raw / factor

    const negative = scaled < 0n
    const digits = (negative ? -scaled : scaled).toString().padStart(places + 1, '0')

    const whole = digits.slice(0, digits.length - places) || '0'
    const fraction = places > 0 ? '.' + digits.slice(digits.length - places) : ''

    return `${negative ? '-' : ''}${whole}${fraction}`
  }

  /**
   * The exact value, for storage. Trailing zeros are trimmed so the database
   * holds a clean numeric rather than a padded string.
   */
  toString(): string {
    const s = this.toFixed(SCALE)
    return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
  }

  /** For display only. Never feed the result back into a calculation. */
  toNumber(): number {
    return Number(this.toFixed(6))
  }
}

/** Integer division rounding halves away from zero. */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n
  const a = numerator < 0n ? -numerator : numerator
  const b = denominator < 0n ? -denominator : denominator

  const quotient = a / b
  const remainder = a % b
  const rounded = remainder * 2n >= b ? quotient + 1n : quotient

  return negative ? -rounded : rounded
}

/**
 * Groups thousands for display. Formatting only — never parsed back.
 *
 * A string is normalised to `decimalPlaces` rather than trusted. Postgres
 * returns numerics at the column's own scale — `numeric(18,4)` hands back
 * "75170620.9700" — and passing that straight through printed four decimal
 * places on the approvals list and, worse, on the rendered PDF. A function
 * whose entire job is formatting should not require its caller to have
 * pre-formatted the input.
 */
export function formatAmount(value: Decimal | string, decimalPlaces = 2): string {
  let text: string
  if (value instanceof Decimal) {
    text = value.toFixed(decimalPlaces)
  } else {
    try {
      text = Decimal.from(value).toFixed(decimalPlaces)
    } catch {
      // Not a number we can parse. Show it as given rather than throwing in a
      // render path — a wrong-looking figure is recoverable, a blank page is not.
      text = value
    }
  }
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const [whole = '0', fraction] = unsigned.split('.')

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}${fraction ? '.' + fraction : ''}`
}
