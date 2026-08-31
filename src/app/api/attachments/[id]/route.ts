import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { submissionAttachments } from '@/db/schema'
import { recordAudit } from '@/lib/audit'
import { asActor } from '@/lib/authz/guard'
import { toUserMessage } from '@/lib/errors'
import { getStorage } from '@/lib/storage'

/**
 * The only way to read an uploaded file.
 *
 * Storage keys are never handed to a browser and grant nothing on their own.
 * Access is decided here, per request: the row lookup runs under Row Level
 * Security as the signed-in user, so a submission they cannot see returns
 * nothing to serve — which becomes a 404, not a 403, so the route cannot be
 * used to discover which attachment ids exist.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  try {
    const result = await asActor(async (db, actor) => {
      const [row] = await db
        .select()
        .from(submissionAttachments)
        .where(and(eq(submissionAttachments.id, id), isNull(submissionAttachments.deletedAt)))
        .limit(1)

      if (!row) return null

      const bytes = await getStorage().get(row.storageKey)

      await recordAudit(db, actor, {
        action: 'attachment.downloaded',
        entityType: 'submission_attachments',
        entityId: row.id,
        metadata: { submissionId: row.submissionId, filename: row.originalFilename },
      })

      return { row, bytes }
    })

    if (!result) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    const { row, bytes } = result

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': row.contentType,
        'Content-Length': String(bytes.byteLength),
        // `inline` so photos preview in a tab; the filename is quoted and was
        // sanitised on upload, so it cannot inject header syntax.
        'Content-Disposition': `inline; filename="${row.originalFilename.replace(/"/g, '')}"`,
        // Uploaded content is untrusted: forbid sniffing and neutralise any
        // active content a file might smuggle past the type checks.
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
