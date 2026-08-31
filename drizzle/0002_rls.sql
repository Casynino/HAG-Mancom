-- ===========================================================================
-- Grants and Row Level Security policies
--
-- Privilege model, in order of strictness:
--   1. No grant at all      — sessions, login_attempts. Reachable only through
--                             SECURITY DEFINER functions.
--   2. Column-level grants  — profiles. password_hash is never selectable or
--                             writable by the application role.
--   3. Table grants + RLS   — everything else.
--
-- DELETE is granted nowhere. Records are archived, cancelled or soft-deleted so
-- that history survives.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- profiles: column-level grants keep password material out of reach
-- ---------------------------------------------------------------------------
grant select (
  id, email, full_name, phone, job_title, is_active, must_change_password,
  password_changed_at, failed_login_attempts, locked_until, last_login_at,
  created_by, created_at, updated_at
) on public.profiles to hagroup_app;

grant insert (
  id, email, full_name, phone, job_title, password_hash, must_change_password,
  is_active, created_by
) on public.profiles to hagroup_app;

grant update (
  full_name, phone, job_title, is_active, must_change_password, updated_at
) on public.profiles to hagroup_app;

-- ---------------------------------------------------------------------------
-- Table grants
-- ---------------------------------------------------------------------------
grant select, insert, update on
  public.user_roles,
  public.clients,
  public.client_vendor_identities,
  public.projects,
  public.project_members,
  public.engineer_submissions,
  public.submission_measurements,
  public.submission_attachments,
  public.notifications,
  public.legal_entities,
  public.entity_addresses,
  public.bank_accounts,
  public.numbering_rules,
  public.charge_rules,
  public.tax_rules,
  public.rounding_policies,
  public.company_assets,
  public.brand_profiles,
  public.approval_policies
to hagroup_app;

-- Append-only tables: insert and read, never modify.
grant select, insert on
  public.audit_log,
  public.submission_events,
  public.approval_decisions,
  public.config_change_log
to hagroup_app;

-- References are allocated exclusively by app.issue_internal_reference().
grant select on public.internal_references to hagroup_app;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array[
    'profiles','user_roles','sessions','login_attempts','clients','client_vendor_identities',
    'projects','project_members','engineer_submissions','submission_measurements',
    'submission_attachments','submission_events','notifications','audit_log',
    'approval_decisions','legal_entities','entity_addresses','bank_accounts',
    'numbering_rules','internal_references','charge_rules','tax_rules','rounding_policies',
    'company_assets','brand_profiles','approval_policies','config_change_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$do$;

-- sessions and login_attempts have RLS on and no policies: the application role
-- cannot read or write them at all. Only the SECURITY DEFINER auth functions can.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select
  using (app.is_active_user());

create policy profiles_insert on public.profiles for insert
  with check (app.is_admin());

-- A user may edit their own contact details; Administrators may edit anyone.
-- Neither can change a password through this path — that is a definer function.
create policy profiles_update on public.profiles for update
  using (app.is_admin() or id = app.current_user_id())
  with check (app.is_admin() or id = app.current_user_id());

-- ---------------------------------------------------------------------------
-- user_roles — visible to all so the UI can attribute actions; writable by
-- Administrators only. This is the table the whole permission system rests on.
-- ---------------------------------------------------------------------------
create policy user_roles_select on public.user_roles for select
  using (app.is_active_user());

create policy user_roles_insert on public.user_roles for insert
  with check (app.is_admin());

create policy user_roles_update on public.user_roles for update
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create policy clients_select on public.clients for select
  using (app.can_see_client(id));

create policy clients_insert on public.clients for insert
  with check (app.is_technical_officer() or app.is_admin());

create policy clients_update on public.clients for update
  using (app.is_technical_officer() or app.is_admin())
  with check (app.is_technical_officer() or app.is_admin());

-- ---------------------------------------------------------------------------
-- client_vendor_identities — configuration, Administrator-controlled
-- ---------------------------------------------------------------------------
create policy client_vendor_identities_select on public.client_vendor_identities for select
  using (app.is_admin() or (state = 'approved' and app.is_staff()));

create policy client_vendor_identities_insert on public.client_vendor_identities for insert
  with check (app.is_admin());

create policy client_vendor_identities_update on public.client_vendor_identities for update
  using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create policy projects_select on public.projects for select
  using (app.is_staff() or app.is_project_member(id));

create policy projects_insert on public.projects for insert
  with check (app.is_technical_officer() or app.is_admin());

create policy projects_update on public.projects for update
  using (app.is_technical_officer() or app.is_admin())
  with check (app.is_technical_officer() or app.is_admin());

-- ---------------------------------------------------------------------------
-- project_members
-- ---------------------------------------------------------------------------
create policy project_members_select on public.project_members for select
  using (
    app.is_staff()
    or user_id = app.current_user_id()
    or app.is_project_member(project_id)
  );

create policy project_members_insert on public.project_members for insert
  with check (app.is_technical_officer() or app.is_admin());

create policy project_members_update on public.project_members for update
  using (app.is_technical_officer() or app.is_admin())
  with check (app.is_technical_officer() or app.is_admin());

-- ---------------------------------------------------------------------------
-- engineer_submissions
--
-- Two separate UPDATE policies rather than one compound expression: the author
-- gets a narrow window, staff get review rights, and the two are readable
-- independently. RLS combines permissive policies with OR.
-- ---------------------------------------------------------------------------
create policy engineer_submissions_select on public.engineer_submissions for select
  using (
    app.is_staff()
    or submitted_by = app.current_user_id()
    or app.is_project_member(project_id)
  );

-- An Engineer may only file against a project they are actually assigned to,
-- and only in their own name.
create policy engineer_submissions_insert on public.engineer_submissions for insert
  with check (
    submitted_by = app.current_user_id()
    and (app.is_project_member(project_id) or app.is_staff())
  );

create policy engineer_submissions_update_author on public.engineer_submissions for update
  using (submitted_by = app.current_user_id() and status in ('draft', 'changes_requested'))
  with check (submitted_by = app.current_user_id());

create policy engineer_submissions_update_staff on public.engineer_submissions for update
  using (app.is_staff()) with check (app.is_staff());

-- ---------------------------------------------------------------------------
-- submission_measurements / submission_attachments
-- Readable by anyone who can see the parent; writable only by the author while
-- the submission is still theirs. The child-editable trigger enforces the
-- status window a second time, for any role.
-- ---------------------------------------------------------------------------
create policy submission_measurements_select on public.submission_measurements for select
  using (app.can_view_submission(submission_id));

create policy submission_measurements_insert on public.submission_measurements for insert
  with check (app.can_edit_submission(submission_id));

create policy submission_measurements_update on public.submission_measurements for update
  using (app.can_edit_submission(submission_id))
  with check (app.can_edit_submission(submission_id));

create policy submission_attachments_select on public.submission_attachments for select
  using (app.can_view_submission(submission_id));

create policy submission_attachments_insert on public.submission_attachments for insert
  with check (app.can_edit_submission(submission_id) and uploaded_by = app.current_user_id());

create policy submission_attachments_update on public.submission_attachments for update
  using (app.can_edit_submission(submission_id))
  with check (app.can_edit_submission(submission_id));

-- ---------------------------------------------------------------------------
-- submission_events — append-only workflow ledger
-- ---------------------------------------------------------------------------
create policy submission_events_select on public.submission_events for select
  using (app.can_view_submission(submission_id));

create policy submission_events_insert on public.submission_events for insert
  with check (app.can_view_submission(submission_id) and actor_id = app.current_user_id());

-- ---------------------------------------------------------------------------
-- notifications — strictly private to their recipient
--
-- INSERT is open to any authenticated user because the application creates
-- notifications on other people's behalf as a side effect of legitimate
-- workflow actions. The protection that matters here is on read: no user can
-- see another user's notifications, whatever the calling code does.
-- ---------------------------------------------------------------------------
create policy notifications_select on public.notifications for select
  using (user_id = app.current_user_id());

create policy notifications_insert on public.notifications for insert
  with check (app.is_active_user());

create policy notifications_update on public.notifications for update
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

-- ---------------------------------------------------------------------------
-- audit_log — writable by anyone acting, readable by oversight roles only
-- ---------------------------------------------------------------------------
create policy audit_log_select on public.audit_log for select
  using (app.is_admin() or app.is_director());

create policy audit_log_insert on public.audit_log for insert
  with check (app.is_active_user());

-- ---------------------------------------------------------------------------
-- approval_decisions
-- ---------------------------------------------------------------------------
create policy approval_decisions_select on public.approval_decisions for select
  using (app.is_staff() or actor_id = app.current_user_id());

create policy approval_decisions_insert on public.approval_decisions for insert
  with check (app.is_staff() and actor_id = app.current_user_id());

-- ---------------------------------------------------------------------------
-- Company configuration
--
-- Administrators see everything including drafts. Other staff see approved
-- values only, so an unapproved extraction can never be mistaken for policy.
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array[
    'legal_entities','entity_addresses','bank_accounts','numbering_rules',
    'charge_rules','tax_rules','rounding_policies','brand_profiles','approval_policies'
  ] loop
    execute format($p$
      create policy %I on public.%I for select
        using (app.is_admin() or (state = 'approved' and app.is_staff()))
    $p$, t || '_select', t);

    execute format($p$
      create policy %I on public.%I for insert with check (app.is_admin())
    $p$, t || '_insert', t);

    execute format($p$
      create policy %I on public.%I for update
        using (app.is_admin()) with check (app.is_admin())
    $p$, t || '_update', t);
  end loop;
end
$do$;

-- ---------------------------------------------------------------------------
-- company_assets — the stamp and signature files
--
-- A signature belongs to one person. Nobody but that person and an
-- Administrator can even see the row, let alone fetch the file. This is the
-- database half of "a Technical Officer must never apply a Director signature";
-- the other half is the authorisation check in the application.
-- ---------------------------------------------------------------------------
create policy company_assets_select on public.company_assets for select
  using (
    app.is_admin()
    or owner_user_id = app.current_user_id()
    or (state = 'approved' and not is_sensitive and app.is_active_user())
  );

create policy company_assets_insert on public.company_assets for insert
  with check (
    app.is_admin()
    or (kind = 'signature' and owner_user_id = app.current_user_id())
  );

create policy company_assets_update on public.company_assets for update
  using (app.is_admin() or (kind = 'signature' and owner_user_id = app.current_user_id()))
  with check (app.is_admin() or (kind = 'signature' and owner_user_id = app.current_user_id()));

-- ---------------------------------------------------------------------------
-- internal_references / config_change_log
-- ---------------------------------------------------------------------------
create policy internal_references_select on public.internal_references for select
  using (app.is_staff());

create policy config_change_log_select on public.config_change_log for select
  using (app.is_admin());

create policy config_change_log_insert on public.config_change_log for insert
  with check (app.is_admin());
