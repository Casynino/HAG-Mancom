import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { companyAssets } from '@/db/schema'
import { asActor } from '@/lib/authz/guard'
import { toUserMessage } from '@/lib/errors'
import { getStorage } from '@/lib/storage'

/**
 * Serves a brand asset.
 *
 * The row is read under the caller's RLS session, and the policy on
 * `company_assets` is what decides whether they see it: a signature is visible
 * only to the person it belongs to and to Administrators, so a Technical
 * Officer cannot fetch a Director's signature image even with its id.
 *
 * A row they cannot see returns 404, not 403, so this cannot be used to
 * enumerate which assets exist.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  try {
    const result = await asActor(async (db) => {
      const [asset] = await db
        .select()
        .from(companyAssets)
        .where(eq(companyAssets.id, id))
        .limit(1)

      if (!asset) return null

      const bytes = await getStorage().get(asset.storageKey)
      return { bytes, contentType: asset.contentType, sensitive: asset.isSensitive }
    })

    if (!result) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(result.bytes), {
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.bytes.byteLength),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        // A signature or stamp is never cached by an intermediary.
        'Cache-Control': result.sensitive
          ? 'private, no-store'
          : 'private, max-age=300, must-revalidate',
      },
    })
  } catch (err) {
    const { message, status } = toUserMessage(err)
    return NextResponse.json({ error: message }, { status })
  }
}
