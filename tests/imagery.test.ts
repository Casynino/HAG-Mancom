import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { photos, type Photo } from '@/lib/company/imagery'

/**
 * Three of these stock photographs were the wrong subject entirely — a
 * telecommunications mast filed as transmission pylons, a PC mainboard filed as
 * a distribution panel, and a tangle of informal street cabling filed as
 * switchgear. They had been chosen on search term without anyone opening them,
 * and they sat on the public site of a company that sells the quality of its
 * electrical workmanship.
 *
 * They stay in the file, marked, so nobody downloads them again. These tests
 * hold two lines: a marked photograph is never rendered, and every photograph
 * the site does use actually exists on disk.
 */

const USED_IN_PAGES = readdirSync(join(process.cwd(), 'src/app/(public)'), {
  recursive: true,
  withFileTypes: true,
})
  .filter((e) => e.isFile() && e.name.endsWith('.tsx'))
  .map((e) => readFileSync(join(e.parentPath ?? e.path, e.name), 'utf8'))
  .join('\n')

describe('public site photography', () => {
  it('never renders a photograph marked as the wrong subject', () => {
    for (const [key, photo] of Object.entries(photos) as Array<[string, Photo]>) {
      if (!photo.offBrand) continue
      expect(
        USED_IN_PAGES.includes(`photos.${key}`),
        `photos.${key} is used on the public site but is marked off-brand: ${photo.offBrand}`,
      ).toBe(false)
    }
  })

  it('every photograph it does use is on disk', () => {
    const files = new Set(readdirSync(join(process.cwd(), 'public/imagery')))
    for (const [key, photo] of Object.entries(photos) as Array<[string, Photo]>) {
      if (!USED_IN_PAGES.includes(`photos.${key}`)) continue
      expect(files.has(photo.src.replace('/imagery/', '')), `${photo.src} is missing`).toBe(true)
    }
  })

  it('every brand mark the pages reference exists in public/brand', () => {
    // The home page shipped a partner logo pointing at a file nobody added, so
    // it 404'd on every load and only the server log knew.
    const files = new Set(readdirSync(join(process.cwd(), 'public/brand')))
    const referenced = [...USED_IN_PAGES.matchAll(/['"]\/brand\/([^'"]+)['"]/g)].map((m) => m[1]!)
    expect(referenced.length).toBeGreaterThan(0)
    for (const file of referenced) {
      expect(files.has(file), `/brand/${file} is referenced but not in public/brand`).toBe(true)
    }
  })

  it('describes each photograph rather than asserting whose site it is', () => {
    for (const photo of Object.values(photos) as Photo[]) {
      expect(photo.alt).not.toMatch(/\b(our|HA GROUP|HAG)\b/i)
      expect(photo.alt.length).toBeGreaterThan(15)
    }
  })
})
