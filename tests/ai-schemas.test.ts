import { describe, expect, it } from 'vitest'
import {
  buildBrandAnalysisPrompt,
  buildCompletenessPrompt,
  buildLetterPrompt,
  buildScopePrompt,
} from '@/lib/ai/document-assistant'

/**
 * Every AI feature in this platform was broken and silent because one schema
 * keyword is rejected by the structured-output validator.
 *
 *   output_config.format.schema: For 'array' type, property 'maxItems' is not supported
 *
 * The request 400s, the calling action swallows the failure by design — the
 * assistant must never block a Technical Officer — and so the drafting simply
 * never happened, with nothing written to ai_interactions and nothing shown to
 * anybody. It was found only by reading an empty table after a call that
 * appeared to succeed.
 *
 * This test walks every schema the platform sends and fails if a rejected
 * keyword reappears. The list is not guesswork: each entry was probed against
 * the live API.
 */

const REJECTED = ['maxItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']

function schemas(): Array<{ name: string; schema: unknown }> {
  return [
    {
      name: 'scope draft',
      schema: buildScopePrompt({
        clientName: 'ALLIANCE ONE TOBACCO TANZANIA LIMITED',
        projectName: 'Maintenance Services — Morogoro',
        submissionTitle: 'Feeder pump motor insulation failure',
        problemDescription: 'Both 45 kW feeder pump motors show winding insulation degradation.',
        recommendedWork: 'Rewind both stators, replace all four bearings, re-align and load test.',
        urgency: 'high',
        measurements: [{ label: 'Insulation resistance', value: '0.28', unit: 'MΩ' }],
        servicePeriodLabel: 'September 2026',
      }).schema,
    },
    {
      name: 'letter',
      schema: buildLetterPrompt({
        clientName: 'ALLIANCE ONE TOBACCO TANZANIA LIMITED',
        subject: 'REQUEST FOR EXTENSION OF PAYMENT DEADLINE',
        intent: 'Ask for two further weeks to settle invoice HI_2670053.',
        tone: 'neutral',
      }).schema,
    },
    {
      name: 'completeness',
      schema: buildCompletenessPrompt({
        documentType: 'quotation',
        hasClient: true,
        hasProject: true,
        hasPurchaseOrder: false,
        hasLines: false,
        hasScope: true,
        hasTerms: false,
        hasDeliveryEvidence: false,
        hasCompletionEvidence: false,
        configurationGaps: [],
      }).schema,
    },
    {
      name: 'brand analysis',
      schema: buildBrandAnalysisPrompt({
        filename: 'HQ_2670053.pdf',
        documentTypeHint: 'Quotation',
        extractedText: 'HA GROUP TZ LTD — QUOTATION',
      }).schema,
    },
  ]
}

function keywordsIn(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const child of node) keywordsIn(child, found)
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      found.add(key)
      keywordsIn(value, found)
    }
  }
  return found
}

describe('structured output schemas', () => {
  for (const { name, schema } of schemas()) {
    it(`${name}: uses no keyword the API rejects`, () => {
      const used = keywordsIn(schema)
      for (const banned of REJECTED) {
        expect(used.has(banned), `${name} uses "${banned}", which 400s the whole request`).toBe(
          false,
        )
      }
    })

    it(`${name}: is a closed object, so the model cannot invent fields`, () => {
      const s = schema as Record<string, unknown>
      expect(s.type).toBe('object')
      expect(s.additionalProperties).toBe(false)
      expect(Array.isArray(s.required)).toBe(true)
    })
  }
})
