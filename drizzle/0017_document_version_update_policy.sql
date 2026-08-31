-- ===========================================================================
-- Allow the rendered artefact to be written back onto its version.
--
-- Migration 0016 granted column-level UPDATE on the artefact columns. That was
-- necessary but not sufficient: `document_versions` has Row Level Security with
-- a SELECT policy and an INSERT policy and no UPDATE policy, so an UPDATE
-- matched no rows at all.
--
-- The failure mode is why this is worth stating plainly. Postgres does not
-- refuse an UPDATE that no policy admits — it reports success and zero rows
-- affected. So approval appeared to work: the status moved to `approved`, the
-- decision and the event were recorded, the PDF and DOCX really were rendered
-- and really were stored. Only the pointer to them was silently dropped, which
-- surfaced much later as a download returning 404 with nothing in any log.
--
-- The policy is scoped to staff, matching the INSERT policy that already
-- governs who may capture a version, and to documents the actor can see, matching
-- the SELECT policy. It does not widen who may write versions; it only lets the
-- rows they may already create and read be completed with the artefact those
-- same actors just produced. Which columns may be written is settled separately
-- by the column grants in 0016, so the snapshot itself stays unwritable.
-- ===========================================================================

create policy document_versions_update on public.document_versions
  for update
  using (app.is_staff() and app.can_view_document(document_id))
  with check (app.is_staff() and app.can_view_document(document_id));
