/**
 * Application errors.
 *
 * Every error that reaches a user carries a message written for that user. Raw
 * database text, stack traces and constraint names never do — `toUserMessage`
 * is the single funnel, and anything it does not recognise becomes a generic
 * message plus a server-side log.
 */

export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number = 400,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Please sign in to continue.') {
    super(message, 'unauthenticated', 401)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to do this.') {
    super(message, 'forbidden', 403)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'That record does not exist, or you cannot access it.') {
    super(message, 'not_found', 404)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message, 'validation', 422)
    this.name = 'ValidationError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'conflict', 409)
    this.name = 'ConflictError'
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many attempts. Please wait a few minutes and try again.') {
    super(message, 'rate_limited', 429)
    this.name = 'RateLimitError'
  }
}

/** Postgres SQLSTATE codes the platform raises deliberately. */
const PG_MESSAGES: Record<string, string> = {
  // raised by app.deny_mutation() and the submission workflow triggers
  '23001': 'That record cannot be changed at this stage.',
  // check_violation — the submission transition guard
  '23514': 'That is not a valid next step for this record.',
  '23505': 'A record with those details already exists.',
  '23503': 'That change would leave a related record orphaned.',
  '42501': 'You do not have permission to do this.',
  P0002: 'The required configuration has not been set up yet.',
}

interface PgLikeError {
  code?: string
  message?: string
}

function isPgError(err: unknown): err is PgLikeError {
  return typeof err === 'object' && err !== null && 'code' in err
}

/**
 * Turns anything thrown into something safe to show a user.
 *
 * Messages raised by our own triggers are surfaced verbatim because they were
 * written to be read — "Submission content is locked once submitted" is more
 * useful than a generic failure. Everything else is generalised.
 */
export function toUserMessage(err: unknown): { message: string; code: string; status: number } {
  if (err instanceof AppError) {
    return { message: err.message, code: err.code, status: err.status }
  }

  if (isPgError(err)) {
    const raised = err.message ?? ''

    // Messages our own triggers raise are intentional and user-facing.
    const ours = [
      'Invalid submission status transition',
      'The submitted snapshot cannot be modified',
      'Submission content is locked once submitted',
      'Cannot modify',
      'append-only',
      'No approved numbering rule',
      'Only the account holder or an Administrator',
    ]
    if (ours.some((fragment) => raised.includes(fragment))) {
      return { message: sanitise(raised), code: 'workflow', status: 409 }
    }

    if (err.code && PG_MESSAGES[err.code]) {
      return { message: PG_MESSAGES[err.code]!, code: err.code, status: 409 }
    }
  }

  // Unrecognised: log the detail, tell the user nothing about internals.
  console.error('[unhandled]', err)
  return {
    message: 'Something went wrong. Please try again, or contact your administrator.',
    code: 'internal',
    status: 500,
  }
}

/** Strips the Postgres context suffix so only the raised sentence remains. */
function sanitise(message: string): string {
  return message.split('\n')[0]!.replace(/^ERROR:\s*/i, '').trim()
}

/** Shape returned by every Server Action, so forms can render results uniformly. */
export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code: string; fieldErrors?: Record<string, string[]> }

export function actionError(err: unknown): ActionResult<never> {
  const { message, code } = toUserMessage(err)
  return {
    ok: false,
    error: message,
    code,
    fieldErrors: err instanceof ValidationError ? err.fieldErrors : undefined,
  }
}
