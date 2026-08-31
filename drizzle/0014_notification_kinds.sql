-- ===========================================================================
-- New notification kinds for the Document Engine, deliveries and compliance.
--
-- ALTER TYPE ... ADD VALUE is used rather than recreating the enum: the type is
-- referenced by an existing column with live rows, and a recreate would mean
-- dropping and restoring that column.
--
-- The new values are added here and used from the next migration onward.
-- Postgres does not allow a value to be used in the same transaction that adds
-- it, which is why nothing below references them.
-- ===========================================================================

alter type public.notification_kind add value if not exists 'document_pending_approval';
alter type public.notification_kind add value if not exists 'document_approved';
alter type public.notification_kind add value if not exists 'document_rejected';
alter type public.notification_kind add value if not exists 'document_changes_requested';
alter type public.notification_kind add value if not exists 'document_issued';
alter type public.notification_kind add value if not exists 'delivery_awaiting_signature';
alter type public.notification_kind add value if not exists 'delivery_confirmed';
alter type public.notification_kind add value if not exists 'compliance_expiring';
alter type public.notification_kind add value if not exists 'compliance_expired';
alter type public.notification_kind add value if not exists 'efd_receipt_required';
