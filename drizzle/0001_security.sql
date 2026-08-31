-- ===========================================================================
-- HA GROUP AI Operations Platform — database-enforced security
--
-- Everything in this file exists so that authorisation survives a bug in the
-- application layer. Frontend route guards and server-side checks are the first
-- line; these policies are the one that actually holds.
--
-- Model:
--   * The app connects as `hagroup_app`, a NOSUPERUSER / NOBYPASSRLS role.
--   * Each request opens a transaction and declares its actor via
--     `set_config('app.user_id', <uuid>, true)`.
--   * Policies read that setting through app.current_user_id().
--   * Work that happens before an identity exists (login, session resolution)
--     runs through SECURITY DEFINER functions that expose only what they must.
--
-- Note on RLS and ownership: `hagroup_owner` owns these tables and therefore
-- bypasses RLS. That is deliberate — migrations and seeding need it. The owner
-- credentials are used by scripts only and never by the running application.
-- Where a guarantee must hold even for the owner (audit immutability, status
-- transitions) it is implemented as a TRIGGER, which no role can bypass.
-- ===========================================================================

create schema if not exists app;
grant usage on schema app to hagroup_app;

-- ---------------------------------------------------------------------------
-- Identity and role predicates
-- ---------------------------------------------------------------------------

-- The acting user for this transaction. Null when unauthenticated.
create or replace function app.current_user_id() returns uuid
language sql stable
as $fn$
  select nullif(current_setting('app.user_id', true), '')::uuid
$fn$;

-- SECURITY DEFINER: reads user_roles, which is itself protected by RLS. Without
-- the definer's rights this would recurse into the policy it is evaluating.
create or replace function app.has_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $fn$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = app.current_user_id()
      and ur.role = p_role
      and ur.revoked_at is null
      and p.is_active
  )
$fn$;

create or replace function app.is_active_user() returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $fn$
  select exists (
    select 1 from public.profiles p
    where p.id = app.current_user_id() and p.is_active
  )
$fn$;

create or replace function app.is_admin() returns boolean
language sql stable as $fn$ select app.has_role('administrator') $fn$;

create or replace function app.is_director() returns boolean
language sql stable as $fn$ select app.has_role('director') $fn$;

create or replace function app.is_technical_officer() returns boolean
language sql stable as $fn$ select app.has_role('technical_officer') $fn$;

create or replace function app.is_engineer() returns boolean
language sql stable as $fn$ select app.has_role('engineer') $fn$;

-- Anyone who works the operational side: Technical Officer, Director, Admin.
create or replace function app.is_staff() returns boolean
language sql stable as $fn$
  select app.has_role('technical_officer')
      or app.has_role('director')
      or app.has_role('administrator')
$fn$;

create or replace function app.is_project_member(p_project_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $fn$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = app.current_user_id()
      and pm.removed_at is null
  )
$fn$;

-- An Engineer sees a client only through a project they are assigned to.
create or replace function app.can_see_client(p_client_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $fn$
  select app.is_staff() or exists (
    select 1
    from public.project_members pm
    join public.projects pr on pr.id = pm.project_id
    where pm.user_id = app.current_user_id()
      and pm.removed_at is null
      and pr.client_id = p_client_id
  )
$fn$;

create or replace function app.can_view_submission(p_submission_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $fn$
  select exists (
    select 1 from public.engineer_submissions s
    where s.id = p_submission_id
      and (
        app.is_staff()
        or s.submitted_by = app.current_user_id()
        or app.is_project_member(s.project_id)
      )
  )
$fn$;

-- The author may change a submission only while it is theirs to change.
create or replace function app.can_edit_submission(p_submission_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public
as $fn$
  select exists (
    select 1 from public.engineer_submissions s
    where s.id = p_submission_id
      and s.submitted_by = app.current_user_id()
      and s.status in ('draft', 'changes_requested')
  )
$fn$;

grant execute on all functions in schema app to hagroup_app;

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end
$fn$;

-- Append-only enforcement. Applies to every role, including table owners and
-- superusers, because triggers are not subject to RLS bypass.
create or replace function app.deny_mutation() returns trigger
language plpgsql as $fn$
begin
  raise exception '% records are append-only and cannot be % (table %)',
    tg_table_name, lower(tg_op), tg_table_name
    using errcode = 'restrict_violation';
end
$fn$;

do $do$
declare t text;
begin
  foreach t in array array[
    'profiles','clients','projects','engineer_submissions','client_vendor_identities',
    'legal_entities','entity_addresses','bank_accounts','numbering_rules','charge_rules',
    'tax_rules','rounding_policies','company_assets','brand_profiles','approval_policies'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end
$do$;

do $do$
declare t text;
begin
  foreach t in array array[
    'audit_log','submission_events','approval_decisions','internal_references','config_change_log'
  ] loop
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function app.deny_mutation()',
      t || '_append_only', t
    );
  end loop;
end
$do$;

-- ---------------------------------------------------------------------------
-- Submission workflow: legal transitions and content locking
-- ---------------------------------------------------------------------------

create or replace function app.enforce_submission_transition() returns trigger
language plpgsql as $fn$
declare
  allowed boolean := false;
begin
  if new.status is distinct from old.status then
    allowed := case old.status
      when 'draft' then
        new.status in ('submitted', 'cancelled')
      when 'submitted' then
        new.status in ('under_review', 'changes_requested', 'accepted', 'cancelled')
      when 'under_review' then
        new.status in ('changes_requested', 'accepted', 'cancelled')
      when 'changes_requested' then
        new.status in ('submitted', 'cancelled')
      when 'accepted' then
        new.status in ('ready_for_documentation', 'changes_requested', 'cancelled')
      when 'ready_for_documentation' then
        new.status in ('changes_requested', 'cancelled')
      when 'cancelled' then
        false
      else false
    end;

    if not allowed then
      raise exception 'Invalid submission status transition: % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  -- The filed snapshot is written when the Engineer submits and is otherwise
  -- immutable. This is what "lock the submitted snapshot from silent editing"
  -- means in practice.
  if old.submitted_snapshot is not null
     and new.submitted_snapshot is distinct from old.submitted_snapshot
     and new.status is not distinct from old.status then
    raise exception 'The submitted snapshot cannot be modified'
      using errcode = 'restrict_violation';
  end if;

  -- Engineer-authored content is frozen unless the submission is back in the
  -- Engineer's hands. Staff may still correct the client/project linkage and
  -- write their own review fields.
  if old.status not in ('draft', 'changes_requested') then
    if new.title is distinct from old.title
       or new.problem_description is distinct from old.problem_description
       or new.recommended_work is distinct from old.recommended_work
       or new.urgency is distinct from old.urgency
       or new.site_visit_date is distinct from old.site_visit_date
       or new.gps_latitude is distinct from old.gps_latitude
       or new.gps_longitude is distinct from old.gps_longitude
       or new.submitted_by is distinct from old.submitted_by then
      raise exception 'Submission content is locked once submitted (status %)', old.status
        using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end
$fn$;

create trigger engineer_submissions_transition_guard
  before update on public.engineer_submissions
  for each row execute function app.enforce_submission_transition();

-- Attachments and measurements follow the parent's editability.
create or replace function app.enforce_child_editable() returns trigger
language plpgsql as $fn$
declare
  parent_status public.submission_status;
begin
  select status into parent_status
  from public.engineer_submissions
  where id = coalesce(new.submission_id, old.submission_id);

  if parent_status is null then
    return coalesce(new, old);
  end if;

  if parent_status not in ('draft', 'changes_requested') then
    raise exception 'Cannot modify % while the submission is %', tg_table_name, parent_status
      using errcode = 'restrict_violation';
  end if;

  return coalesce(new, old);
end
$fn$;

create trigger submission_measurements_editable
  before insert or update or delete on public.submission_measurements
  for each row execute function app.enforce_child_editable();

create trigger submission_attachments_editable
  before insert or update or delete on public.submission_attachments
  for each row execute function app.enforce_child_editable();
