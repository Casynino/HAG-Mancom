import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { deliveryPhotos } from '@/db/schema'
import { asActor } from '@/lib/authz/guard'
import { toUserMessage } from '@/lib/errors'
import { getStorage } from '@/lib/storage'

/**
 * Serves a proof-of-delivery photograph.
 *
 * The row is read under the caller's RLS session, whose policy limits delivery
 * photos to staff and members of the owning project.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  try {
    const result = await asActor(async (db) => {
      const [photo] = await db
        .select()
        .from(deliveryPhotos)
        .where(eq(deliveryPhotos.id, id))
        .limit(1)

      if (!photo) return null
      return {
        bytes: await getStorage().get(photo.storageKey),
        contentType: photo.contentType,
        filename: photo.originalFilename,
      }
    })

    if (!result) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    return new NextResponse(new Uint8Array(result.bytes), {
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.bytes.byteLength),
        'Content-Disposition': `inline; filename="${result.filename.replace(/"/g, '')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    })
  } catch (err) {
    const { message, status } = toUserMessage(err)
    return NextResponse.json({ error: message }, { status })
  }
}
