-- ===========================================================================
-- Let a version record where its rendered files went — once — and nothing else.
--
-- `document_versions` carried a blanket append-only trigger: BEFORE UPDATE OR
-- DELETE, raise. The intent is right and is the backbone of this system: the
-- snapshot a Director approved must never change afterwards.
--
-- But it made approval impossible. Approval must, in order:
--
--   1. capture the approved version,
--   2. record which seals were applied (document_seals references the version),
--   3. render the PDF and DOCX — the sealed rendering reads those seal rows, so
--      it cannot run before step 2 —
--   4. record where the rendered files were stored.
--
-- Step 4 is an UPDATE on a row created in step 1, and the trigger refused it.
-- The consequence was quiet and bad: the status moved to `approved`, the
-- decision and event were written, the files really were rendered and stored,
-- and only the pointer to them was lost. Downloads then 404'd with nothing in
-- any log to explain why. No document could ever be downloaded after approval.
--
-- Rendering before the insert would avoid the update, but cannot: the sealed
-- rendering depends on seal rows that reference the version that does not exist
-- yet. So the guarantee is made precise instead of absolute.
--
-- What is permitted: filling in the six artefact pointers, each exactly once,
-- from NULL to a value. What is not: changing them once set, changing anything
-- else on the row, or deleting it. The snapshot, its hash, the version number,
-- the captured status and the seal flags remain immutable — enforced here for
-- every role including the table owner, since triggers are not subject to RLS
-- bypass.
-- ===========================================================================

create or replace function app.document_version_artefact_writeonce() returns trigger
language plpgsql as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'document_versions records are append-only and cannot be deleted'
      using errcode = 'restrict_violation';
  end if;

  -- Everything that is not an artefact pointer must be identical.
  if new.id is distinct from old.id
     or new.document_id is distinct from old.document_id
     or new.version is distinct from old.version
     or new.status_at_capture is distinct from old.status_at_capture
     or new.snapshot::text is distinct from old.snapshot::text
     or new.content_hash is distinct from old.content_hash
     or new.change_summary is distinct from old.change_summary
     or new.is_approved_version is distinct from old.is_approved_version
     or new.signature_applied is distinct from old.signature_applied
     or new.stamp_applied is distinct from old.stamp_applied
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception
      'A document version records what was approved and cannot be altered. Only the storage location of its rendered files may be filled in, once.'
      using errcode = 'restrict_violation';
  end if;

  -- Each pointer may be set once and never changed or cleared.
  if old.pdf_storage_key is not null and new.pdf_storage_key is distinct from old.pdf_storage_key then
    raise exception 'The rendered PDF for this version is already recorded and cannot be replaced.'
      using errcode = 'restrict_violation';
  end if;
  if old.docx_storage_key is not null and new.docx_storage_key is distinct from old.docx_storage_key then
    raise exception 'The rendered DOCX for this version is already recorded and cannot be replaced.'
      using errcode = 'restrict_violation';
  end if;
  if old.signed_pdf_storage_key is not null
     and new.signed_pdf_storage_key is distinct from old.signed_pdf_storage_key then
    raise exception 'The sealed PDF for this version is already recorded and cannot be replaced.'
      using errcode = 'restrict_violation';
  end if;

  return new;
end
$fn$;

drop trigger if exists document_versions_append_only on public.document_versions;

create trigger document_versions_artefact_writeonce
  before update or delete on public.document_versions
  for each row execute function app.document_version_artefact_writeonce();
