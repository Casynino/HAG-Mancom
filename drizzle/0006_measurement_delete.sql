-- ===========================================================================
-- Measurements are the one child record an Engineer genuinely replaces while
-- editing a draft: re-entering a reading should not leave the old value behind.
--
-- DELETE is granted here and nowhere else in the schema. It stays safe because
-- two other controls already apply to this table:
--   * the RLS policy below limits deletion to the author of an editable submission;
--   * app.enforce_child_editable() rejects any change once the submission has
--     left draft or changes_requested, for every role including the owner.
--
-- Attachments deliberately do NOT get this. They are evidence, and are removed
-- by setting deleted_at so the original bytes and the record of them survive.
-- ===========================================================================

grant delete on public.submission_measurements to hagroup_app;

create policy submission_measurements_delete on public.submission_measurements for delete
  using (app.can_edit_submission(submission_id));
