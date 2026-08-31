import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/**
 * Password hashing with scrypt from the Node standard library.
 *
 * scrypt rather than bcrypt or argon2 because it needs no native module — the
 * platform deploys to Vercel, where a build-time native dependency is a
 * recurring source of breakage. scrypt is memory-hard and is the algorithm
 * Node exposes for exactly this purpose.
 *
 * Stored format: scrypt$N$r$p$<salt base64url>$<hash base64url>
 * The parameters travel with the hash so they can be raised later without
 * invalidating existing passwords.
 */

const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 2 ** 15 * 8 * 2 }
const KEY_LENGTH = 64
const SALT_LENGTH = 16

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS)
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

/**
 * Constant-time verification. Returns false rather than throwing on a malformed
 * stored value, so a corrupt row cannot be told apart from a wrong password.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false

    const N = Number(parts[1])
    const r = Number(parts[2])
    const p = Number(parts[3])
    const salt = Buffer.from(parts[4]!, 'base64url')
    const expected = Buffer.from(parts[5]!, 'base64url')

    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false
    if (salt.length === 0 || expected.length === 0) return false

    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    })

    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/**
 * Password policy. Deliberately length-first: length contributes far more
 * resistance than character-class rules, which mostly push people toward
 * predictable substitutions.
 */
export const PASSWORD_MIN_LENGTH = 12

export function validatePasswordStrength(password: string): string[] {
  const problems: string[] = []

  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  }
  if (password.length > 200) {
    problems.push('Use no more than 200 characters.')
  }
  if (!/[a-z]/i.test(password)) {
    problems.push('Include at least one letter.')
  }
  if (!/[0-9]/.test(password) && !/[^A-Za-z0-9]/.test(password)) {
    problems.push('Include at least one number or symbol.')
  }
  if (/^(.)\1+$/.test(password)) {
    problems.push('Do not use a single repeated character.')
  }

  return problems
}
