/**
 * Development fixtures.
 *
 * Creates a Technical Officer, a Director, one client and one project, and
 * assigns the Engineer to it — the minimum needed to walk the workflow in a
 * browser. Not part of the production seed; run it only in development.
 *
 *   npx tsx scripts/demo.ts
 *
 * The client here is Alliance One Tanzania because that is the counterparty in
 * every document supplied for the Phase 0 analysis. Its TIN and VRN are the
 * values printed on those invoices.
 */
import { config } from 'dotenv'
import { Client } from 'pg'
import { hashPassword } from '../src/lib/auth/password'

config({ path: '.env.local', quiet: true })

const PEOPLE = [
  {
    email: 'officer@hagroup.local',
    name: 'Technical Officer',
    jobTitle: 'Technical Officer',
    roles: ['technical_officer'],
    password: 'TechnicalOffice-2026',
  },
  {
    email: 'director@hagroup.local',
    name: 'C. Msindo',
    jobTitle: 'Executive Chairman',
    roles: ['director'],
    password: 'DirectorApproval-2026',
  },
]

async function main() {
  const url = process.env.DATABASE_ADMIN_URL
  if (!url) throw new Error('DATABASE_ADMIN_URL must be set')

  const c = new Client({ connectionString: url })
  await c.connect()

  try {
    await c.query('begin')

    const ids: Record<string, string> = {}

    for (const person of PEOPLE) {
      const existing = await c.query<{ id: string }>(
        'select id from profiles where lower(email) = lower($1)',
        [person.email],
      )

      let id: string
      if (existing.rows.length > 0) {
        id = existing.rows[0]!.id
        console.log(`${person.email} already exists`)
      } else {
        const hash = await hashPassword(person.password)
        const inserted = await c.query<{ id: string }>(
          `insert into profiles (email, full_name, job_title, password_hash, must_change_password, is_active)
           values ($1, $2, $3, $4, true, true) returning id`,
          [person.email, person.name, person.jobTitle, hash],
        )
        id = inserted.rows[0]!.id
        console.log(`created ${person.email}  password: ${person.password}`)
      }

      ids[person.email] = id

      for (const role of person.roles) {
        await c.query(
          `insert into user_roles (user_id, role)
           select $1, $2::app_role
           where not exists (
             select 1 from user_roles where user_id = $1 and role = $2::app_role and revoked_at is null
           )`,
          [id, role],
        )
      }
    }

    // Client
    const clientRow = await c.query<{ id: string }>(
      `insert into clients (legal_name, trading_name, tin, vrn, address_line1, postal_address, city, country,
                            contact_person, contact_phone, status)
       values ('ALLIANCE ONE TOBACCO TANZANIA LIMITED', 'Alliance One Tanzania',
               '100228211', '20-011269-N', 'Aointl Complex, Plot 2 Kingolwira', 'P.O. Box 1595',
               'Morogoro', 'Tanzania', 'MR Z. CHANGALIMA', '+255 232 934 216', 'active')
       on conflict do nothing
       returning id`,
    )

    const clientId =
      clientRow.rows[0]?.id ??
      (
        await c.query<{ id: string }>(
          "select id from clients where legal_name = 'ALLIANCE ONE TOBACCO TANZANIA LIMITED'",
        )
      ).rows[0]!.id

    // Project
    const projectRow = await c.query<{ id: string }>(
      `insert into projects (client_id, name, reference, description, location, status, start_date)
       values ($1, 'Kingolwira Maintenance Contract', 'HA/PRJ/2026/001',
               'Recurring electromechanical maintenance at the Kingolwira processing plant.',
               'Kingolwira, Morogoro', 'active', current_date)
       on conflict (reference) do nothing
       returning id`,
      [clientId],
    )

    const projectId =
      projectRow.rows[0]?.id ??
      (await c.query<{ id: string }>("select id from projects where reference = 'HA/PRJ/2026/001'"))
        .rows[0]!.id

    // Assign the Engineer created through the admin UI, plus the Technical Officer.
    const engineer = await c.query<{ id: string }>(
      "select id from profiles where lower(email) = 'adam.engineer@hagroup.local'",
    )

    const assignees = [engineer.rows[0]?.id, ids['officer@hagroup.local']].filter(
      (v): v is string => Boolean(v),
    )

    for (const userId of assignees) {
      await c.query(
        `insert into project_members (project_id, user_id, is_lead)
         select $1, $2, false
         where not exists (
           select 1 from project_members
           where project_id = $1 and user_id = $2 and removed_at is null
         )`,
        [projectId, userId],
      )
    }

    await c.query('commit')

    console.log(`\nclient  : ALLIANCE ONE TOBACCO TANZANIA LIMITED`)
    console.log(`project : HA/PRJ/2026/001 — Kingolwira Maintenance Contract`)
    console.log(`assigned: ${assignees.length} people`)
    console.log('\nEach account must change its password at first sign-in.')
  } catch (err) {
    await c.query('rollback')
    throw err
  } finally {
    await c.end()
  }
}

main().catch((err) => {
  console.error('\n' + (err instanceof Error ? err.message : String(err)))
  process.exit(1)
})
