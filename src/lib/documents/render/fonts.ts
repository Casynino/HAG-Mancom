import 'server-only'

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/**
 * Document fonts.
 *
 * HA GROUP's documents are set in Century Gothic — confirmed on 203 of 206
 * styled runs in the source DOCX. Century Gothic is a licensed Monotype face
 * and is not redistributable, so it is NOT bundled with this repository.
 *
 * If HA GROUP provides a licensed copy, drop the TTF files into the directory
 * named by DOCUMENT_FONT_DIR and they are picked up automatically. Until then
 * the renderer falls back to a metric-similar geometric sans and records which
 * face it actually used, so nobody mistakes a fallback rendering for the real
 * company document.
 *
 * The fallback is never silent: `resolveFont()` reports it, the document
 * footer notes it, and the Administrator sees it in Company settings.
 */

export interface FontChoice {
  /** The family name registered with the renderer. */
  family: string
  /** True when the genuine licensed Century Gothic is in use. */
  isLicensedCenturyGothic: boolean
  /** Paths to the registered files, empty when using a built-in face. */
  files: { regular?: string; bold?: string; italic?: string }
  /** Shown to users when a substitute is in play. */
  substitutionNotice: string | null
}

// turbopackIgnore keeps a configurable path from making the bundler trace and
// ship the whole project. Fonts are read at runtime from disk, not bundled.
const FONT_DIR = process.env.DOCUMENT_FONT_DIR
  ? resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DOCUMENT_FONT_DIR)
  : join(process.cwd(), 'assets', 'fonts')

/** Filenames looked for, in order of preference. */
const CANDIDATES = {
  regular: ['CenturyGothic.ttf', 'GOTHIC.TTF', 'Century Gothic.ttf'],
  bold: ['CenturyGothic-Bold.ttf', 'GOTHICB.TTF', 'Century Gothic Bold.ttf'],
  italic: ['CenturyGothic-Italic.ttf', 'GOTHICI.TTF'],
}

function findFirst(names: string[]): string | undefined {
  for (const name of names) {
    const path = join(FONT_DIR, name)
    if (existsSync(path)) return path
  }
  return undefined
}

let cached: FontChoice | null = null

export function resolveFont(): FontChoice {
  if (cached) return cached

  const regular = findFirst(CANDIDATES.regular)

  if (regular) {
    cached = {
      family: 'Century Gothic',
      isLicensedCenturyGothic: true,
      files: {
        regular,
        bold: findFirst(CANDIDATES.bold),
        italic: findFirst(CANDIDATES.italic),
      },
      substitutionNotice: null,
    }
    return cached
  }

  cached = {
    // Helvetica is built into the PDF renderer, so this always works. It is not
    // metrically identical to Century Gothic — line breaks will differ slightly.
    family: 'Helvetica',
    isLicensedCenturyGothic: false,
    files: {},
    substitutionNotice:
      'Rendered in Helvetica because a licensed Century Gothic font file has not been installed. ' +
      `Place the TTF files in ${FONT_DIR} to render in the company typeface.`,
  }
  return cached
}

/** Clears the cache. Used after an Administrator installs the font. */
export function resetFontCache(): void {
  cached = null
}

export async function loadFontBuffer(path: string): Promise<Buffer> {
  return readFile(path)
}

export { FONT_DIR }
