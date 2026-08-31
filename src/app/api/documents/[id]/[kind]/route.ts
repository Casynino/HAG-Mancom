import { NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { documentVersions, documents } from '@/db/schema'
import { recordAudit } from '@/lib/audit'
import { asActor } from '@/lib/authz/guard'
import { toUserMessage } from '@/lib/errors'
import { getStorage } from '@/lib/storage'
import { withExtension } from '@/lib/documents/naming'

/**
 * Downloads a rendered document.
 *
 * `kind` selects which rendering:
 *   signed   — the approved copy with the signature and stamp applied
 *   pdf      — the unsigned rendering, always preserved
 *   docx     — the editable Word rendering
 *
 * Permission is decided per request against the document row, which is read
 * under the caller's RLS session. A document they cannot see returns 404 rather
 * than 403, so this route cannot be used to discover which documents exist.
 */
/**
 * Rendering a PDF or DOCX is CPU-bound and can outrun the default serverless
 * limit on a long document, so this route asks for more time than a page does.
 */
export const maxDuration = 60

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; kind: string }> },
) {
  const { id, kind } = await context.params

  if (!['signed', 'pdf', 'docx'].includes(kind)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  try {
    const result = await asActor(async (db, actor) => {
      const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1)
      if (!doc) return null

      // Prefer the approved version; fall back to the latest for a draft preview.
      const [approved] = await db
        .select()
        .from(documentVersions)
        .where(
          and(eq(documentVersions.documentId, id), eq(documentVersions.isApprovedVersion, true)),
        )
        .limit(1)

      const [latest] = approved
        ? [approved]
        : await db
            .select()
            .from(documentVersions)
            .where(eq(documentVersions.documentId, id))
            .orderBy(desc(documentVersions.version))
            .limit(1)

      if (!latest) return null

      const key =
        kind === 'signed'
          ? (latest.signedPdfStorageKey ?? latest.pdfStorageKey)
          : kind === 'docx'
            ? latest.docxStorageKey
            : latest.pdfStorageKey

      if (!key) return null

      const bytes = await getStorage().get(key)

      const baseName = doc.filename ?? `${doc.reference ?? 'document'}.pdf`
      const filename = kind === 'docx' ? withExtension(baseName, 'docx') : baseName

      await recordAudit(db, actor, {
        action: 'document.downloaded',
        entityType: 'documents',
        entityId: id,
        metadata: { kind, version: latest.version, reference: doc.reference },
      })

      return {
        bytes,
        filename,
        contentType:
          kind === 'docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/pdf',
        // A signed final document opens inline for review; the editable Word
        // file is always a download.
        disposition: kind === 'docx' ? 'attachment' : 'inline',
      }
    })

    if (!result) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(result.bytes), {
      headers: {
        'Content-Type': result.contentType,
        'Content-Length': String(result.bytes.byteLength),
        'Content-Disposition': `${result.disposition}; filename="${result.filename.replace(/"/g, '')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    })
  } catch (err) {
    const { message, status } = toUserMessage(err)
    return NextResponse.json({ error: message }, { status })
  }
}
