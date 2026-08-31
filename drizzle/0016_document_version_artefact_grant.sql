-- ===========================================================================
-- Let the runtime write a rendered artefact back onto the version it belongs to.
--
-- `document_versions` was granted INSERT and SELECT only. The intent behind that
-- is right: a version is the captured state a Director was asked to decide on,
-- and it must not change afterwards.
--
-- But approval works in two beats. Submitting captures the snapshot; approving
-- then renders the PDF and DOCX and has to record where they were stored. With
-- no UPDATE privilege the second beat failed with `permission denied for table
-- document_versions` — after the render had succeeded and after approved_at had
-- been written. The document was left approved-but-not-approved: a timestamp
-- set, the status still pending, no artefact reachable. No document could be
-- approved at all.
--
-- The fix keeps the original intent rather than reaching for a blanket grant.
-- UPDATE is granted on the artefact columns only. `snapshot`, `content_hash`,
-- `version`, `document_id` and `status_at_capture` remain unwritable by the
-- application, so the thing that was actually approved still cannot be altered
-- — now enforced by privilege as well as by trigger.
-- ===========================================================================

grant update (
  -- Where the rendered files went, written once the render succeeds.
  pdf_storage_key,
  pdf_byte_size,
  docx_storage_key,
  docx_byte_size,
  signed_pdf_storage_key,
  signed_pdf_byte_size,

  -- What the approval did, recorded at the moment of the decision.
  is_approved_version,
  signature_applied,
  stamp_applied
) on public.document_versions to hagroup_app;
