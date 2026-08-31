import { config } from 'dotenv'

// Tests read the same .env.local the application does, so they exercise the
// real restricted role rather than a permissive test connection.
config({ path: '.env.local', quiet: true })
