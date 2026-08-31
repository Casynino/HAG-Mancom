import 'server-only'

import { headers } from 'next/headers'
import type { Database } from '@/db/client'
import { auditLog, notifications } from '@/db/schema'
import type { AppRole } from '@/lib/authz/roles'
import type { Actor } from '@/lib/authz/guard'

/**
 * Audit and notification writes.
 *
 * Audit records are written inside the same transaction as the change they
 * describe. If the change rolls back, so does its audit record — the trail
 * never claims something happened that did not, and never misses something
 * that did.
 */

export type AuditAction =
  | 'auth.sign_in'
  | 'auth.sign_in_failed'
  | 'auth.sign_out'
  | 'auth.password_changed'
  | 'user.created'
  | 'user.updated'
  | 'user.deactivated'
  | 'user.role_granted'
  | 'user.role_revoked'
  | 'client.created'
  | 'client.updated'
  | 'client.archived'
  | 'project.created'
  | 'project.updated'
  | 'project.member_added'
  | 'project.member_removed'
  | 'submission.created'
  | 'submission.updated'
  | 'submission.submitted'
  | 'submission.review_started'
  | 'submission.changes_requested'
  | 'submission.accepted'
  | 'submission.marked_ready'
  | 'submission.cancelled'
  | 'attachment.uploaded'
  | 'attachment.removed'
  | 'attachment.downloaded'
  | 'config.created'
  | 'config.updated'
  | 'config.submitted_for_approval'
  | 'config.approved'
  | 'config.rejected'
  | 'asset.uploaded'
  | 'asset.replaced'
  // Documents
  | 'document.created'
  | 'document.updated'
  | 'document.submitted_for_approval'
  | 'document.approved'
  | 'document.rejected'
  | 'document.changes_requested'
  | 'document.issued'
  | 'document.cancelled'
  | 'document.rendered'
  | 'document.downloaded'
  | 'document.signature_applied'
  | 'document.stamp_applied'
  | 'document.emailed'
  // Commercial and operations
  | 'purchase_order.recorded'
  | 'purchase_order.updated'
  | 'purchase_order.cancelled'
  | 'delivery.created'
  | 'delivery.signed'
  | 'delivery.confirmed'
  | 'completion.recorded'
  | 'completion.verified'
  | 'efd.recorded'
  | 'contact.created'
  | 'contact.updated'
  | 'compliance.type_created'
  | 'compliance.recorded'
  | 'compliance.renewed'
  | 'compliance.alert_sent'
  // AI
  | 'ai.draft_generated'
  | 'brand.asset_uploaded'
  | 'brand.analysis_completed'
  | 'brand.profile_proposed'

export interface AuditInput {
  action: AuditAction
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Records an action. Must be called with the same transaction handle as the
 * work it describes.
 */
export async function recordAudit(
  db: Database,
  actor: Pick<Actor, 'id' | 'email' | 'primaryRole'> | null,
  input: AuditInput,
): Promise<void> {
  let ip: string | null = null
  let userAgent: string | null = null

  try {
    const h = await headers()
    ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
    userAgent = h.get('user-agent')?.slice(0, 500) ?? null
  } catch {
    // Outside a request context (scripts, tests). The record is still written.
  }

  await db.insert(auditLog).values({
    actorId: actor?.id ?? null,
    actorRole: (actor?.primaryRole ?? null) as AppRole | null,
    actorEmail: actor?.email ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? null,
    ipAddress: ip,
    userAgent,
  })
}

export interface NotificationInput {
  userId: string
  kind:
    | 'submission_submitted'
    | 'submission_changes_requested'
    | 'submission_accepted'
    | 'submission_ready_for_documentation'
    | 'submission_cancelled'
    | 'project_assignment'
    | 'config_pending_approval'
    | 'config_approved'
    | 'config_rejected'
    | 'document_pending_approval'
    | 'document_approved'
    | 'document_rejected'
    | 'document_changes_requested'
    | 'document_issued'
    | 'delivery_awaiting_signature'
    | 'delivery_confirmed'
    | 'compliance_expiring'
    | 'compliance_expired'
    | 'efd_receipt_required'
  title: string
  body?: string | null
  entityType?: string | null
  entityId?: string | null
  href?: string | null
}

export async function notify(
  db: Database,
  actorId: string | null,
  input: NotificationInput,
): Promise<void> {
  await db.insert(notifications).values({
    userId: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    href: input.href ?? null,
    createdBy: actorId,
  })
}

/** Fan-out helper. Skips the actor so nobody is notified of their own action. */
export async function notifyMany(
  db: Database,
  actorId: string | null,
  userIds: readonly string[],
  input: Omit<NotificationInput, 'userId'>,
): Promise<number> {
  const recipients = [...new Set(userIds)].filter((id) => id !== actorId)
  if (recipients.length === 0) return 0

  await db.insert(notifications).values(
    recipients.map((userId) => ({
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      href: input.href ?? null,
      createdBy: actorId,
    })),
  )

  return recipients.length
}
