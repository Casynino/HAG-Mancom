import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })
import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic()

async function probe(label: string, props: Record<string, unknown>) {
  const schema = { type: 'object', additionalProperties: false, required: ['v'], properties: props }
  try {
    await client.messages.create({
      model: 'claude-opus-5', max_tokens: 500,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as never } },
      messages: [{ role: 'user', content: 'Return anything valid.' }],
    })
    console.log(`  supported   : ${label}`)
  } catch (e: any) {
    console.log(`  UNSUPPORTED : ${label} -> ${String(e.message).replace(/[\s\S]*message":"/, '').slice(0, 90)}`)
  }
}

async function main() {
  await probe('array maxItems', { v: { type: 'array', maxItems: 5, items: { type: 'string' } } })
  await probe('array minItems', { v: { type: 'array', minItems: 1, items: { type: 'string' } } })
  await probe('string maxLength', { v: { type: 'string', maxLength: 50 } })
  await probe('string minLength', { v: { type: 'string', minLength: 2 } })
  await probe('number minimum', { v: { type: 'number', minimum: 0 } })
  await probe('string enum', { v: { type: 'string', enum: ['a', 'b'] } })
  await probe('nullable union', { v: { type: ['string', 'null'] } })
  await probe('string pattern', { v: { type: 'string', pattern: '^[A-Z]+$' } })
  await probe('plain string', { v: { type: 'string' } })
}
main()
