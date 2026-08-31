# Deploying the HA GROUP AI Operations Platform

Target: **Neon** (PostgreSQL) + **Vercel** (Next.js) + **Vercel Blob** (file storage).

Work through this in order. Step 4 is the one that cannot be skipped or reordered —
the migrations grant privileges to a role that must already exist.

---

## What you need before you start

| Thing | Where it comes from |
|---|---|
| A Neon project | neon.tech — create a project, choose a region |
| A Vercel account | vercel.com |
| A Git remote | GitHub, GitLab or Bitbucket |
| An Anthropic API key | *optional* — console.anthropic.com |
| A Resend API key | *optional* — resend.com |
| Century Gothic TTF files | *optional* — licensed from Monotype |

The three optional items are genuinely optional. Without them the AI assistant,
outbound email and the company typeface each report themselves as unavailable;
nothing else changes and nothing silently degrades.

**Pick the Neon region to match the Vercel region.** Every page render makes
several database round-trips, so the distance between the function and the
database matters far more than the distance between the function and Dar es
Salaam. `vercel.json` sets `iad1` (US East, Virginia), which pairs with Neon's
`aws-us-east-2` and with the Blob store. If you move the database, change
`regions` in `vercel.json` to match it.

---

## 1. Create the Neon database

In the Neon console, create a project. Neon gives you a database (usually
`neondb`) and an owner role (usually `neondb_owner`) with a connection string
that looks like:

```
postgresql://neondb_owner:PASSWORD@ep-xxxx-yyyy.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

Keep it. It is used exactly twice — once in step 2 and once in step 4 — and
never by the running application.

---

## 2. Create the two application roles

The platform connects to Postgres as **two different roles**, and this is the
foundation of its whole authorisation model:

- **`hagroup_owner`** owns every table. Migrations run as this role.
- **`hagroup_app`** is the running application's identity. It is `NOSUPERUSER`,
  `NOBYPASSRLS`, and deliberately *not* the owner of any table.

The reason for the split is that PostgreSQL exempts three kinds of role from Row
Level Security: superusers, roles with `BYPASSRLS`, and **a table's own owner**.
Since every permission rule in this platform is a Row Level Security policy, a
runtime connection as any of those three would silently switch off the entire
security model while every screen continued to look correct.

Locally, create a `.env.local` (copy `.env.example`) with all three URLs:

```bash
DATABASE_SUPERUSER_URL="postgresql://neondb_owner:...@ep-xxxx.../neondb?sslmode=require"
DATABASE_ADMIN_URL="postgresql://hagroup_owner:CHOOSE_A_PASSWORD@ep-xxxx.../neondb?sslmode=require"
DATABASE_URL="postgresql://hagroup_app:CHOOSE_ANOTHER_PASSWORD@ep-xxxx.../neondb?sslmode=require"
DB_DRIVER="neon"
```

Use the **same host and database name** in all three; only the username and
password differ. Then:

```bash
npm run db:bootstrap:neon
```

It creates both roles, hands the `public` schema to `hagroup_owner`, and then
re-reads `pg_roles` to confirm `hagroup_app` really is restricted. If that last
check fails it refuses to continue.

> Roles created this way work normally but do not appear in the Neon console's
> "Roles" tab, which only lists roles Neon itself created. `select rolname from
> pg_roles` in the Neon SQL editor will show them.

---

## 3. Apply the schema

```bash
npm run db:migrate
```

This applies every `.sql` file in `drizzle/` in filename order, once each, inside
a transaction, as `hagroup_owner`. It records a SHA-256 checksum per file, so a
migration that is edited after being applied is detected rather than silently
diverging.

The migrations create the tables, then the Row Level Security policies, then the
`app` schema of `SECURITY DEFINER` functions, then the append-only triggers.
Running them out of order is not possible; running them twice is a no-op.

---

## 4. Create the first Administrator

Add to `.env.local`:

```bash
BOOTSTRAP_ADMIN_EMAIL="you@hpcagroup.africa"
BOOTSTRAP_ADMIN_NAME="Your Name"
BOOTSTRAP_ADMIN_PASSWORD="a long passphrase you will change immediately"
```

```bash
npm run db:seed
```

The account is created with `must_change_password = true`, so the first sign-in
forces a change. **Delete those three values from your environment afterwards.**
Preflight warns while they are still set.

The seed also loads the configuration values observed in HA GROUP's historical
documents — the entity name, the numbering pattern, the VAT and administration
rates — as **drafts**. Nothing among them is in effect. An Administrator has to
open Company settings and approve each one, and several of them contradict each
other, which is why they are presented for a decision rather than applied.

---

## 5. Verify before you deploy

```bash
npm run preflight
```

It checks the things that fail quietly rather than loudly:

- the runtime role cannot bypass Row Level Security
- Row Level Security is enabled on every application table
- `profiles.password_hash` is unreadable by the runtime role
- no applied migration has been edited since
- the connection requires TLS
- the storage driver is credentialed, and is not `local` on Vercel
- there is at least one active Administrator
- which settings are still unapproved, and therefore what cannot yet be issued

A failure exits non-zero. Warnings do not — an unconfigured email provider is a
fact to know, not a defect.

Then confirm the build itself:

```bash
npm run typecheck && npm test && npm run build
```

---

## 6. Push to Git

```bash
git init
git add .
git commit -m "HA GROUP AI Operations Platform"
git remote add origin <your remote>
git push -u origin main
```

`.env.local` is git-ignored. Confirm before pushing that no real credential is
staged:

```bash
git ls-files | grep -i env
```

That should list `.env.example` and nothing else.

---

## 7. Create the Vercel project

Import the repository at vercel.com/new. Framework detection reads `vercel.json`
and finds Next.js. Do **not** deploy yet — set the environment first.

### Add a Blob store

Project → Storage → Create → Blob. Connecting it sets `BLOB_READ_WRITE_TOKEN`
automatically.

This is not optional. Vercel's filesystem is ephemeral: with
`STORAGE_DRIVER=local` every site photograph, delivery signature, purchase-order
scan and rendered document would vanish between requests. Preflight fails the
deploy if it sees that combination.

### Set the environment variables

Project → Settings → Environment Variables. For **Production**:

| Key | Value |
|---|---|
| `DATABASE_URL` | the `hagroup_app` connection string, with `?sslmode=require` |
| `DB_DRIVER` | `neon` |
| `STORAGE_DRIVER` | `vercel-blob` |
| `BLOB_READ_WRITE_TOKEN` | set for you when you connected the Blob store |
| `EMAIL_FROM` | `business@hpcagroup.africa` *(optional)* |
| `RESEND_API_KEY` | your Resend key *(optional)* |
| `ANTHROPIC_API_KEY` | your Anthropic key *(optional)* |

Do **not** set `DATABASE_ADMIN_URL`, `DATABASE_SUPERUSER_URL`, or any
`BOOTSTRAP_ADMIN_*` value on Vercel. The application never needs them, and a
privileged connection string sitting in the runtime environment is exactly the
thing the two-role split exists to prevent.

`DB_DRIVER=neon` matters: it selects the WebSocket serverless driver. A normal
TCP pool exhausts Neon's connection limit under serverless concurrency.

### Deploy

Deployments → Deploy. Or:

```bash
npx vercel --prod
```

---

## 8. After the first deploy

1. Sign in as the bootstrap Administrator. You are forced to change the password.
2. Delete `BOOTSTRAP_ADMIN_*` from your local `.env.local`.
3. **Company settings** → work through the drafts. Nothing can be issued until a
   legal entity, a numbering rule, a rounding policy, an approval policy and —
   for tax invoices — a VAT rate are approved. Read the note on each: they were
   extracted from historical documents and some conflict.
4. **Brand assets** → upload the company logo, the partner marks, and the company
   stamp. Each **Director uploads their own signature** — nobody can upload a
   signature on someone else's behalf, and the database enforces that, not just
   the screen.
5. **Users** → create the real Engineer, Technical Officer and Director accounts.
6. Run `npm run preflight` once more against production to confirm what is now
   approved and what is still blocking.

---

## Ongoing: applying a schema change

Migrations run from a machine that holds `DATABASE_ADMIN_URL`, not from Vercel.
There is no build-time migration step, deliberately: a failed migration during a
deploy would leave the schema half-applied with no clean rollback.

```bash
npm run db:generate          # only if you changed src/db/schema
npm run db:migrate           # applies, as hagroup_owner
npm run preflight            # confirms nothing drifted
git push                     # Vercel builds and deploys the code
```

Apply the migration **before** pushing code that depends on it. The old code
tolerates a new column; new code does not tolerate a missing one.

---

## What this deployment does not include

State these plainly rather than discovering them later:

- **No TRA / EFD integration.** The platform does not issue fiscal receipts and
  has no environment variable that would let it. An EFD receipt number is typed
  in by a person from a certified fiscal device, and stored as evidence against
  the invoice. Anything else would be a claim the platform cannot honour.
- **No Century Gothic** unless you supply the licensed TTF files. Without them
  documents render in Helvetica and say so.
- **Client Purchase Order numbers are never generated.** They are issued by the
  client; the platform stores, validates, displays and attaches them. The
  database rejects a blank PO number and refuses any later change to the number,
  the client, or the project it belongs to.
- **No automated backup beyond Neon's.** Neon's point-in-time restore covers the
  database. It does not cover the Blob store.
