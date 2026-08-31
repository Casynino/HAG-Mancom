-- ===========================================================================
-- Engineer submission references
--
-- Deliberately separate from app.issue_internal_reference().
--
-- Company document numbers (HQ_2670053 and the like) are governed by an
-- Administrator-approved numbering rule, because their format is a business
-- decision that Phase 0 showed is still unresolved. A submission reference is
-- an internal work ticket with no historical precedent and no external meaning,
-- so it must not depend on that approval — an Engineer has to be able to file
-- from site on day one.
--
-- Uniqueness comes from a Postgres sequence, which is concurrency-safe by
-- construction. Sequence gaps on rollback are acceptable here; for company
-- documents they would not be, which is the other reason these are separate.
-- ===========================================================================

create sequence if not exists public.engineer_submission_seq;

create or replace function app.next_submission_reference() returns text
language plpgsql security definer set search_path = pg_catalog, public
as $fn$
declare v_seq bigint;
begin
  if app.current_user_id() is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  v_seq := nextval('public.engineer_submission_seq');
  return 'SUB-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 5, '0');
end
$fn$;

grant execute on function app.next_submission_reference() to hagroup_app;
