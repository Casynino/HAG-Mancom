import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { AppError } from '@/lib/errors'
import { sanitiseFilename, type AttachmentKind } from './limits'

/**
 * Object storage behind a driver interface.
 *
 * Files are never served from a public URL. Every read goes through an
 * authorised route handler that re-checks permissions against the owning
 * record, so possessing a storage key grants nothing on its own.
 *
 * Local driver for development; Vercel Blob for deployed environments.
 *
 * Vercel Blob objects are written with `access: 'private'`, so a blob URL is
 * useless without credentials. That matters most for the Director signatures
 * and the company stamp: with a public store, anyone who ever saw a URL could
 * keep reading the seal that makes a document authentic. Reads go through the
 * SDK's authenticated `get`, server-side, after the route handler has checked
 * permissions against the owning record.
 */

export interface StoredObject {
  key: string
  contentType: string
  byteSize: number
  checksumSha256: string
}

export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<Buffer>
  remove(key: string): Promise<void>
}

/**
 * Storage keys are generated, never taken from user input. This validator is a
 * second line: it rejects traversal and anything outside a known-safe alphabet
 * before a key reaches the filesystem.
 */
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,240}$/

function assertSafeKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes('..') || key.includes('//')) {
    throw new AppError('Invalid storage reference.', 'storage_key', 400)
  }
}

class LocalDriver implements StorageDriver {
  constructor(private readonly root: string) {}

  private path(key: string): string {
    assertSafeKey(key)
    const full = resolve(this.root, key)
    const rootResolved = resolve(this.root)
    // Belt and braces: even if the pattern check were wrong, refuse to touch
    // anything that resolves outside the storage root.
    if (full !== rootResolved && !full.startsWith(rootResolved + sep)) {
      throw new AppError('Invalid storage reference.', 'storage_key', 400)
    }
    return full
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<void> {
    const full = this.path(key)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, data, { flag: 'wx' })
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.path(key))
    } catch {
      throw new AppError('That file is no longer available.', 'storage_missing', 404)
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.path(key))
    } catch {
      // Already gone. Removal is idempotent by design.
    }
  }
}

class VercelBlobDriver implements StorageDriver {
  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key)
    const { put } = await import('@vercel/blob')
    await put(key, data, {
      access: 'private',
      contentType,
      addRandomSuffix: false,
      // Keys already carry a UUID, so a collision means a duplicate write.
      allowOverwrite: false,
    })
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key)
    const { get } = await import('@vercel/blob')

    // Authenticated read. `get` returns null when the object is absent, and a
    // 304 only for a conditional request, which this is not.
    const result = await get(key, { access: 'private' }).catch(() => null)
    if (!result || result.statusCode !== 200) {
      throw new AppError('That file is no longer available.', 'storage_missing', 404)
    }

    return Buffer.from(await new Response(result.stream).arrayBuffer())
  }

  async remove(key: string): Promise<void> {
    assertSafeKey(key)
    const { del } = await import('@vercel/blob')
    await del(key).catch(() => undefined)
  }
}

let driver: StorageDriver | null = null

export function getStorage(): StorageDriver {
  if (driver) return driver

  const kind = process.env.STORAGE_DRIVER ?? 'local'
  if (kind === 'vercel-blob') {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new AppError(
        'Storage is not configured. BLOB_READ_WRITE_TOKEN is missing.',
        'storage_config',
        500,
      )
    }
    driver = new VercelBlobDriver()
  } else {
    // The turbopackIgnore marker keeps a configurable path from making the
    // bundler trace and ship the entire project. The local driver is a
    // development convenience; deployed environments use the blob driver.
    const root = process.env.STORAGE_LOCAL_DIR
      ? resolve(/* turbopackIgnore: true */ process.cwd(), process.env.STORAGE_LOCAL_DIR)
      : join(process.cwd(), 'storage')
    driver = new LocalDriver(root)
  }
  return driver
}

/**
 * Builds an opaque key for a submission attachment. The original filename is
 * kept in the database for display; it never appears in the key, so a
 * hostile filename cannot influence where bytes land.
 */
export function submissionAttachmentKey(
  submissionId: string,
  kind: AttachmentKind,
  originalFilename: string,
): string {
  const ext = extname(sanitiseFilename(originalFilename)).toLowerCase().slice(0, 10)
  const safeExt = /^\.[a-z0-9]{1,9}$/.test(ext) ? ext : ''
  return `submissions/${submissionId}/${kind}/${randomUUID()}${safeExt}`
}

export function companyAssetKey(kind: string, originalFilename: string): string {
  const ext = extname(sanitiseFilename(originalFilename)).toLowerCase().slice(0, 10)
  const safeExt = /^\.[a-z0-9]{1,9}$/.test(ext) ? ext : ''
  return `company/${kind}/${randomUUID()}${safeExt}`
}

export function checksum(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export { join as joinStoragePath }
