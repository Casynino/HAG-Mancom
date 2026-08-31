import { defineConfig } from 'drizzle-kit'

/**
 * Schema generation runs against the ADMIN connection, which owns the schema.
 * The application itself never uses this URL — it connects as the restricted
 * role so Row Level Security applies.
 */
const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL

if (!url) {
  throw new Error('DATABASE_ADMIN_URL (or DATABASE_URL) must be set to run drizzle-kit')
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
