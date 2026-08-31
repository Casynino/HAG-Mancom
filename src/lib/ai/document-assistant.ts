import 'server-only'

/**
 * What the AI is actually asked to do.
 *
 * Each task below is narrow on purpose. The model is given a small, explicit
 * set of facts a person already supplied and asked to phrase them; it is never
 * given a blank page and a client name.
 *
 * Two rules are enforced by construction rather than by instruction:
 *
 *   * No figures. Quantities and prices are not sent to the model and cannot
 *     come back from it — the schemas below have no numeric fields for money.
 *     The Technical Officer enters prices; the finance engine computes totals.
 *   * No identifiers. PO numbers, reference numbers, TINs, VRNs and receipt
 *     numbers are never in a prompt and never in a response schema.
 *
 * The system prompt restates these because a model that understands why a
 * boundary exists respects it more reliably — but the schema is what makes it
 * impossible.
 */

const GUARDRAILS = `
You are drafting wording for HA GROUP TZ LTD, an electromechanical engineering
company in Tanzania. You are assisting qualified engineers and a Technical
Officer — they will review and edit everything you write.

Absolute rules:
- Use ONLY the facts given to you. If something is not stated, do not supply it.
- Never invent client names, contact names, addresses, tax numbers, purchase
  order numbers, reference numbers, dates, prices, quantities or totals.
- Never state that anything has been approved, delivered, paid, certified or
  registered. You do not know those things.
- If a required fact is missing, name it in the "missing" list rather than
  guessing or writing a placeholder like "TBC" into the prose.
- Write in British English, in the plain, direct register of an engineering
  company writing to a long-standing industrial client. No marketing language,
  no adjectives that are not load-bearing.
- Prefer the shortest wording that is unambiguous to a plant engineer.
`.trim()

/* -------------------------------------------------------------------------- */
/* Scope and line-item drafting                                                */
/* -------------------------------------------------------------------------- */

export interface ScopeDraftInput {
  clientName: string
  projectName: string
  submissionTitle: string
  problemDescription: string
  recommendedWork: string
  urgency: string
  measurements: Array<{ label: string; value: string; unit: string }>
  servicePeriodLabel?: string | null
}

export interface ScopeDraft {
  /** The SCOPE: line. One line, upper case, no full stop. */
  scopeLine: string
  /** Suggested line items. Descriptions only — never quantities or prices. */
  lineDescriptions: string[]
  /** Facts the Technical Officer must supply before this can be priced. */
  missing: string[]
  /** Anything in the submission that looks contradictory or unclear. */
  concerns: string[]
}

/**
 * A note on array bounds.
 *
 * These schemas do not use `maxItems`, and must not: the structured-output
 * validator rejects the whole request with
 *
 *   output_config.format.schema: For 'array' type, property 'maxItems' is not supported
 *
 * and the rejection is a 400 that the calling action deliberately swallows so a
 * Technical Officer is never blocked by the assistant. The two together are how
 * every AI feature in this platform sat broken and completely silent. `maxLength`,
 * `minLength` and `minItems` are supported; numeric `minimum` is not. Bounds on
 * array length therefore live in the description, where the model reads them,
 * and the real ceiling is `max_tokens`. A test asserts that no rejected keyword
 * reappears in any schema here.
 */
const SCOPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scopeLine', 'lineDescriptions', 'missing', 'concerns'],
  properties: {
    scopeLine: {
      type: 'string',
      maxLength: 120,
      description: 'Short upper-case scope line, e.g. MAINTENANCE SERVICES — JUNE 2026',
    },
    lineDescriptions: {
      type: 'array',
      items: { type: 'string', maxLength: 300 },
      description:
        'One description per chargeable line. Describe the work only. Never include a quantity, ' +
        'a rate, a price or a total.',
    },
    missing: {
      type: 'array',
      items: { type: 'string', maxLength: 200 },
      description: 'Facts needed before this can be priced or issued.',
    },
    concerns: {
      type: 'array',
      items: { type: 'string', maxLength: 300 },
      description: 'Contradictions or ambiguities in the engineer’s submission.',
    },
  },
} as const

export function buildScopePrompt(input: ScopeDraftInput): {
  system: string
  prompt: string
  schema: Record<string, unknown>
} {
  const measurements =
    input.measurements.length > 0
      ? input.measurements.map((m) => `- ${m.label}: ${m.value} ${m.unit}`).join('\n')
      : '- none recorded'

  return {
    system: `${GUARDRAILS}

You are turning an engineer's site submission into the scope wording and line
item descriptions for a quotation. You do not price anything and you are not
given any prices.`,
    prompt: `Client: ${input.clientName}
Project: ${input.projectName}
${input.servicePeriodLabel ? `Service period: ${input.servicePeriodLabel}` : ''}
Urgency the engineer set: ${input.urgency}

The engineer's title for the job:
${input.submissionTitle}

What the engineer found on site:
${input.problemDescription}

What the engineer recommends:
${input.recommendedWork}

Measurements taken on site:
${measurements}

Draft the scope line and the chargeable line descriptions. List what the
Technical Officer still needs before this can be priced.`,
    schema: SCOPE_SCHEMA,
  }
}

/* -------------------------------------------------------------------------- */
/* Official letters                                                            */
/* -------------------------------------------------------------------------- */

export interface LetterDraftInput {
  clientName: string
  recipientName?: string | null
  recipientTitle?: string | null
  projectName?: string | null
  subject: string
  /** What the Technical Officer wants the letter to say, in their own words. */
  intent: string
  tone: 'neutral' | 'firm' | 'apologetic'
}

export interface LetterDraft {
  subject: string
  salutation: string
  body: string
  closing: string
  missing: string[]
}

const LETTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'salutation', 'body', 'closing', 'missing'],
  properties: {
    subject: { type: 'string', maxLength: 200 },
    salutation: { type: 'string', maxLength: 120 },
    body: {
      type: 'string',
      maxLength: 6000,
      description:
        'The letter body. Paragraphs separated by blank lines. No letterhead, no signature block ' +
        '— the platform adds those. No invented dates, amounts or reference numbers.',
    },
    closing: { type: 'string', maxLength: 120 },
    missing: { type: 'array', items: { type: 'string', maxLength: 200 } },
  },
} as const

export function buildLetterPrompt(input: LetterDraftInput): {
  system: string
  prompt: string
  schema: Record<string, unknown>
} {
  return {
    system: `${GUARDRAILS}

You are drafting an official letter on HA GROUP letterhead. The platform adds
the letterhead, the date, the reference number and the signature block — do not
write any of those. Write only the salutation, the body and the closing.

Tone: ${input.tone}.`,
    prompt: `Client: ${input.clientName}
${input.recipientName ? `Recipient: ${input.recipientName}${input.recipientTitle ? `, ${input.recipientTitle}` : ''}` : 'Recipient: not specified'}
${input.projectName ? `Project: ${input.projectName}` : ''}
Subject the officer wants: ${input.subject}

What the officer wants the letter to say, in their words:
${input.intent}

Draft the letter.`,
    schema: LETTER_SCHEMA,
  }
}

/* -------------------------------------------------------------------------- */
/* Completeness check                                                          */
/* -------------------------------------------------------------------------- */

export interface CompletenessInput {
  documentType: string
  hasClient: boolean
  hasProject: boolean
  hasPurchaseOrder: boolean
  hasLines: boolean
  hasScope: boolean
  hasTerms: boolean
  hasDeliveryEvidence: boolean
  hasCompletionEvidence: boolean
  configurationGaps: string[]
}

export interface CompletenessReport {
  readyToSubmit: boolean
  blocking: string[]
  advisory: string[]
}

const COMPLETENESS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['readyToSubmit', 'blocking', 'advisory'],
  properties: {
    readyToSubmit: { type: 'boolean' },
    blocking: { type: 'array', items: { type: 'string', maxLength: 250 } },
    advisory: { type: 'array', items: { type: 'string', maxLength: 250 } },
  },
} as const

/**
 * Note this is advisory only. The real gates — a client PO on an invoice,
 * signed delivery or completion evidence, approved configuration — are enforced
 * by database triggers, and the model's opinion cannot override them. This
 * exists so a Technical Officer finds out early rather than at submission.
 */
export function buildCompletenessPrompt(input: CompletenessInput): {
  system: string
  prompt: string
  schema: Record<string, unknown>
} {
  return {
    system: `${GUARDRAILS}

You are checking whether a document is ready to send for approval. You are told
which pieces are present as true/false. Report what is missing.

You are advisory only. The platform enforces its own rules regardless of what
you say, and it will refuse a tax invoice without a client Purchase Order and
signed delivery or completion evidence whatever you conclude.`,
    prompt: `Document type: ${input.documentType}

Present:
- client linked: ${input.hasClient}
- project linked: ${input.hasProject}
- client purchase order linked: ${input.hasPurchaseOrder}
- priced line items: ${input.hasLines}
- scope wording: ${input.hasScope}
- terms and conditions: ${input.hasTerms}
- confirmed delivery evidence: ${input.hasDeliveryEvidence}
- verified completion evidence: ${input.hasCompletionEvidence}

Company configuration still unapproved:
${input.configurationGaps.length > 0 ? input.configurationGaps.map((g) => `- ${g}`).join('\n') : '- none'}

What blocks submission, and what is merely worth checking?`,
    schema: COMPLETENESS_SCHEMA,
  }
}

/* -------------------------------------------------------------------------- */
/* Brand analysis                                                              */
/* -------------------------------------------------------------------------- */

export interface BrandAnalysisResult {
  documentType: string | null
  fonts: string[]
  headings: string[]
  standardClauses: Array<{ heading: string; body: string }>
  referencePattern: string | null
  observations: string[]
  confidence: 'high' | 'medium' | 'low'
}

const BRAND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'documentType',
    'fonts',
    'headings',
    'standardClauses',
    'referencePattern',
    'observations',
    'confidence',
  ],
  properties: {
    documentType: { type: ['string', 'null'], maxLength: 60 },
    fonts: { type: 'array', items: { type: 'string', maxLength: 80 } },
    headings: { type: 'array', items: { type: 'string', maxLength: 200 } },
    standardClauses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'body'],
        properties: {
          heading: { type: 'string', maxLength: 200 },
          body: { type: 'string', maxLength: 2000 },
        },
      },
    },
    referencePattern: {
      type: ['string', 'null'],
      maxLength: 120,
      description:
        'The document numbering pattern as a token template, e.g. {PREFIX}_{YY}{M}{SEQ}. Null if ' +
        'the document carries no reference or the pattern is not clear from one example.',
    },
    observations: { type: 'array', items: { type: 'string', maxLength: 300 } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
} as const

export function buildBrandAnalysisPrompt(input: {
  filename: string
  documentTypeHint: string | null
  extractedText: string
}): { system: string; prompt: string; schema: Record<string, unknown> } {
  return {
    system: `${GUARDRAILS}

You are analysing an approved historical HA GROUP document to learn the
company's documentation standards. Report only what is observable in the text
you are given.

This produces a PROPOSAL. An Administrator reviews everything you report before
any of it affects a live document, so it is far better to mark something
uncertain than to assert it. Set confidence to "low" when a single example
cannot establish a pattern.`,
    prompt: `Filename: ${input.filename}
${input.documentTypeHint ? `The uploader says this is a: ${input.documentTypeHint}` : ''}

Extracted text:
---
${input.extractedText.slice(0, 40000)}
---

Identify the document type, the standard headings and clauses, and the
reference numbering pattern. Note anything inconsistent.`,
    schema: BRAND_SCHEMA,
  }
}

export { GUARDRAILS as AI_GUARDRAILS }
