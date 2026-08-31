import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Structural rules for `'use server'` modules.
 *
 * Next.js compiles a `'use server'` file into a table of remotely-callable
 * endpoints, and it will only accept async functions there. Exporting anything
 * else — a constant, an object, a synchronous helper — does not fail to compile
 * and does not fail at import. It fails at the moment the first server action in
 * that module is invoked, with "A 'use server' file can only export async
 * functions, found object", and it takes down *every* action in the file.
 *
 * That failure mode is why this test exists. It is invisible to `tsc`, invisible
 * to `next build`, and invisible to any test that does not drive the browser. It
 * cost the Company Settings, Brand Assets and document approval screens a
 * working submit button, each of which looked entirely correct until pressed.
 */

const SERVER_DIR = join(process.cwd(), 'src', 'server')

function serverActionFiles(): string[] {
  return readdirSync(SERVER_DIR)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => {
      const first = readFileSync(join(SERVER_DIR, f), 'utf8').trimStart()
      return first.startsWith("'use server'") || first.startsWith('"use server"')
    })
}

describe("'use server' modules", () => {
  const files = serverActionFiles()

  it('there are server action modules to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s exports only async functions', (file) => {
    const source = readFileSync(join(SERVER_DIR, file), 'utf8')

    const offenders: string[] = []

    for (const [i, line] of source.split('\n').entries()) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('export')) continue

      // Type-only exports are erased before the compiler ever sees them.
      if (/^export\s+(type|interface)\b/.test(trimmed)) continue
      if (/^export\s+\{[^}]*\}\s+from\s+/.test(trimmed) && /\btype\b/.test(trimmed)) continue

      if (/^export\s+async\s+function\s/.test(trimmed)) continue

      // Everything else reaching this point is a value export, and a value
      // export is exactly what breaks the module.
      offenders.push(`${file}:${i + 1}  ${trimmed}`)
    }

    expect(
      offenders,
      offenders.length > 0
        ? `A "use server" file may only export async functions. Move these to a ` +
            `plain module (for example src/lib/…) and import them from there:\n` +
            offenders.join('\n')
        : undefined,
    ).toEqual([])
  })
})

/**
 * Nothing the application needs may be excluded from the repository.
 *
 * A `.gitignore` pattern without a leading slash matches at every level, so the
 * entry meant to exclude the local upload directory (`storage/`) also excluded
 * `src/lib/storage/` — the storage driver itself. The working tree built fine;
 * a clone of the repository would not have. That failure only appears on a
 * fresh checkout, which is to say in CI or on the deployment platform, long
 * after the mistake was made.
 */
describe('repository completeness', () => {
  it('no source file is excluded from version control', () => {
    let ignored: string
    try {
      ignored = execFileSync(
        'git',
        ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '--', 'src', 'scripts', 'drizzle', 'tests'],
        { cwd: process.cwd(), encoding: 'utf8' },
      )
    } catch {
      // Not a git checkout (a tarball, a sandbox). Nothing to assert.
      return
    }

    const paths = ignored.split('\n').filter(Boolean)

    expect(
      paths,
      paths.length > 0
        ? `These are excluded by .gitignore but the application needs them. A ` +
            `pattern like "storage/" matches at every level — anchor it with a ` +
            `leading slash ("/storage/") so it only applies at the repository ` +
            `root:\n` +
            paths.join('\n')
        : undefined,
    ).toEqual([])
  })
})
