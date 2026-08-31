# HA GROUP AI Operations Platform

Engineering operations and documentation platform for HA GROUP TZ LTD.

**Phase 1 — Foundation, mobile engineer intake, and controlled configuration.**

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16, App Router | Matches the team's existing Vercel deployment target |
| Database | PostgreSQL (Neon in production) | Row Level Security is the authorisation boundary |
| ORM | Drizzle | Typed schema, plain SQL where it matters |
| Styling | Tailwind CSS v4 | |
| Storage | Vercel Blob, local filesystem in development | Driver interface — one file to swap |
| Validation | Zod | Shared between client and server |
| Tests | Vitest | |

Runs on Node 22. Node 20.10 was the machine default and is too old for the current toolchain.

---

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run db:bootstrap           # creates the database and both Postgres roles
npm run db:migrate             # applies drizzle/*.sql in order
npm run db:seed                # first Administrator + Phase 0 config as drafts
npm run dev
```

`db:demo` adds development fixtures — a Technical Officer, a Director, one client
and one project. Do not run it against production.

---

## Security model

Authorisation is enforced in the database, not in the application. The
application layer produces good error messages; the database is what actually
holds the line.

**Two Postgres roles.**
`hagroup_owner` owns the schema and is used only by migration scripts.
`hagroup_app` is the application's runtime identity — `NOSUPERUSER`,
`NOBYPASSRLS`, so every statement it issues is subject to Row Level Security.
A role with either attribute silently ignores every policy in the system, which
is why `scripts/bootstrap.ts` sets them explicitly and a test asserts them.

**Per-request identity.** Each request opens a transaction and declares who is
acting:

```sql
begin;
select set_config('app.user_id', '<uuid>', true);   -- transaction-local
...
commit;
```

`SET LOCAL` semantics mean a pooled connection can never leak one user's
identity into another user's request. See `src/db/client.ts` and
`src/lib/authz/guard.ts` — nothing that touches business data bypasses those.

**Password material.** `profiles.password_hash` is excluded from the
application role's `SELECT` and `UPDATE` grants. It leaves the database exactly
once, through `app.find_login_candidate()`, so it can be verified in Node.
Passwords change only through `app.set_password()`, which makes its own
authorisation check.

**Append-only tables.** `audit_log`, `submission_events`, `approval_decisions`,
`internal_references` and `config_change_log` reject `UPDATE` and `DELETE` via a
trigger. Triggers are not subject to RLS bypass, so this holds for the schema
owner and for a superuser. A consequence worth knowing: a profile that has
issued a reference or written an audit record can no longer be deleted, because
the foreign key would null those columns. Accounts are deactivated, never
deleted — which is the intended behaviour.

**Files.** Uploads are checked three ways before a byte is stored: declared MIME
type against a per-kind allow-list, size against a per-kind limit, and the
leading bytes against the declared type. A renamed executable fails the third
check. Storage keys are generated, never derived from user input, and files are
readable only through `/api/attachments/[id]`, which re-checks permission
against the owning record on every request.

---

## Migrations

`drizzle/*.sql` is applied in filename order by `scripts/migrate.ts`, which
records a checksum per file. **An applied migration is immutable** — changing
one is an error; add a new file instead.

Generated table DDL and hand-written security SQL live in the same sequence.
`drizzle-kit generate` numbers from its own journal, so a generated file usually
needs renaming to the next free number in this directory.

| File | Contents |
|---|---|
| `0000` | Tables, indexes, enums (generated) |
| `0001` | `app` schema, role predicates, workflow triggers |
| `0002` | Grants and Row Level Security policies |
| `0003` | SECURITY DEFINER functions — auth, sessions, reference allocation |
| `0004` | Submission reference sequence |
| `0005` | `bank_accounts.notes` |
| `0006` | Measurement delete grant |
| `0007` | `resolve_session` returns `text[]` |
| `0008` | Table-level insert grant on `profiles` |

Two of those exist because of bugs that only end-to-end running caught, and both
notes explain why — worth reading before adding queries that return a custom
enum array or rely on column-level `INSERT` grants.

---

## Configuration is data

Nothing observed in a historical HA GROUP document is ever activated
automatically. Every configuration record carries a `state`
(`draft → approved`), analysis writes `draft`, and an Administrator promotes it.
Approving supersedes the previous version rather than deleting it, so "what was
the approved VAT rate in March" stays answerable.

The seed loads the Phase 0 observations as **13 drafts**, several of which
contradict each other on purpose — the registered entity name appears three
different ways across the sample documents, and the numbering pattern in the
master brief matches none of them. Those conflicts are decisions for HA GROUP,
surfaced rather than resolved.

---

## Testing

```bash
npm test
```

117 tests. The database tests run against the real restricted role, so they
exercise the same path a request takes.

| File | Covers |
|---|---|
| `authorization.test.ts` | RLS per role, unauthenticated access, password material, session resolution |
| `workflow.test.ts` | Legal and illegal status transitions, content locking, audit immutability |
| `lifecycle.test.ts` | The full draft → ready-for-documentation path, including real file storage |
| `numbering.test.ts` | Reference allocation under genuine concurrency |
| `validation.test.ts` | Permission matrix, file validation, passwords, input schemas |

---

## Not in this phase

Quotation, invoice and document rendering belong to the Document Engine phase
and are deliberately absent rather than stubbed. The approval policy data model,
the delegation rules and the decision ledger are already in place beneath them.
