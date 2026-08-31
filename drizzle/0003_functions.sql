-- ===========================================================================
-- SECURITY DEFINER functions
--
-- These are the only paths that reach data the application role cannot touch
-- directly. Each one is deliberately narrow: it takes the minimum input, does
-- one job, and returns the minimum output.
--
-- Every function pins `search_path` so that a schema earlier on someone else's
-- path cannot shadow a table or operator referenced inside it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Authentication
--
-- The password hash leaves the database exactly once, here, so it can be
-- verified in the Node process. Nothing else in the system can select it.
-- ---------------------------------------------------------------------------
create or replace function app.find_login_candidate(p_email text)
returns table (
  id uuid,
  email text,
  full_name text,
  password_hash text,
  is_active boolean,
  must_change_password boolean,
  failed_login_attempts integer,
  locked_until timestamptz
)
language sql stable security definer set search_path = pg_catalog, public
as $fn$
  select p.id, p.email, p.full_name, p.password_hash, p.is_active,
         p.must_change_password, p.failed_login_attempts, p.locked_until
  from public.profiles p
  where lower(p.email) = lower(p_email)
  limit 1
$fn$;

create or replace function app.log_login_attempt(
  p_email text,
  p_ip text,
  p_successful boolean,
  p_reason text default null
) returns void
language sql security definer set search_path = pg_catalog, public
as $fn$
  insert into public.login_attempts (email, ip_address, successful, reason)
  values (p_email, p_ip, p_successful, p_reason)
$fn$;

-- Backs the coarse rate limit. Counts failures for either the account or the
-- source address, so credential stuffing across many accounts is also slowed.
create or replace function app.recent_failure_count(
  p_email text,
  p_ip text,
  p_minutes integer default 15
) returns table (email_failures bigint, ip_failures bigint)
language sql stable security definer set search_path = pg_catalog, public
as $fn$
  select
    count(*) filter (where lower(la.email) = lower(p_email)),
    count(*) filter (where p_ip is not null and la.ip_address = p_ip)
  from public.login_attempts la
  where la.successful = false
    and la.created_at > now() - make_interval(mins => p_minutes)
$fn$;

create or replace function app.register_login_failure(p_email text, p_lock_threshold integer default 8)
returns void
language plpgsql security definer set search_path = pg_catalog, public
as $fn$
begin
  update public.profiles
     set failed_login_attempts = failed_login_attempts + 1,
         locked_until = case
           when failed_login_attempts + 1 >= p_lock_threshold then now() + interval '15 minutes'
           else locked_until
         end
   where lower(email) = lower(p_email);
end
$fn$;

create or replace function app.register_login_success(p_user_id uuid)
returns void
language sql security definer set search_path = pg_catalog, public
as $fn$
  update public.profiles
     set failed_login_attempts = 0,
         locked_until = null,
         last_login_at = now()
   where id = p_user_id
$fn$;

-- ---------------------------------------------------------------------------
-- Sessions
--
-- Only the SHA-256 digest of the cookie token is ever stored, so a database
-- dump cannot be replayed as a set of live logins.
-- ---------------------------------------------------------------------------
create or replace function app.create_session(
  p_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_ip text default null,
  p_user_agent text default null
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public
as $fn$
declare v_id uuid;
begin
  insert into public.sessions (user_id, token_hash, expires_at, ip_address, user_agent)
  values (p_user_id, p_token_hash, p_expires_at, p_ip, p_user_agent)
  returning id into v_id;
  return v_id;
end
$fn$;

create or replace function app.resolve_session(p_token_hash text)
returns table (
  session_id uuid,
  user_id uuid,
  email text,
  full_name text,
  must_change_password boolean,
  expires_at timestamptz,
  roles public.app_role[]
)
language plpgsql security definer set search_path = pg_catalog, public
as $fn$
begin
  return query
  with live as (
    update public.sessions s
       set last_seen_at = now()
     where s.token_hash = p_token_hash
       and s.revoked_at is null
       and s.expires_at > now()
    returning s.id, s.user_id, s.expires_at
  )
  select live.id, live.user_id, p.email, p.full_name, p.must_change_password, live.expires_at,
         coalesce(
           array(
             select ur.role from public.user_roles ur
             where ur.user_id = p.id and ur.revoked_at is null
             order by ur.role
           ),
           array[]::public.app_role[]
         )
  from live
  join public.profiles p on p.id = live.user_id
  where p.is_active;
end
$fn$;

create or replace function app.revoke_session(p_token_hash text) returns void
language sql security definer set search_path = pg_catalog, public
as $fn$
  update public.sessions set revoked_at = now()
  where token_hash = p_token_hash and revoked_at is null
$fn$;

-- Used when a password changes or an account is deactivated: every other
-- session for that user dies immediately.
create or replace function app.revoke_user_sessions(p_user_id uuid, p_except uuid default null)
returns integer
language plpgsql security definer set search_path = pg_catalog, public
as $fn$
declare v_count integer;
begin
  update public.sessions
     set revoked_at = now()
   where user_id = p_user_id
     and revoked_at is null
     and (p_except is null or id <> p_except);
  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Password changes
--
-- SECURITY DEFINER because password_hash is not writable by the application
-- role. The authorisation check is therefore made explicitly, inside.
-- ---------------------------------------------------------------------------
create or replace function app.set_password(
  p_user_id uuid,
  p_password_hash text,
  p_must_change boolean default false
) returns void
language plpgsql security definer set search_path = pg_catalog, public
as $fn$
begin
  if app.current_user_id() is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if app.current_user_id() <> p_user_id and not app.is_admin() then
    raise exception 'Only the account holder or an Administrator may change this password'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
     set password_hash = p_password_hash,
         password_changed_at = now(),
         must_change_password = p_must_change,
         failed_login_attempts = 0,
         locked_until = null
   where id = p_user_id;

  if not found then
    raise exception 'No such user' using errcode = 'no_data_found';
  end if;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Internal reference allocation
--
-- The uniqueness guarantee for document numbers. An advisory lock scoped to
-- (document type, period) serialises allocation, and the unique index on
-- `formatted` is the backstop. AI is never involved in producing a number —
-- it may only propose the pattern, which an Administrator then approves.
-- ---------------------------------------------------------------------------
create or replace function app.issue_internal_reference(
  p_document_type public.document_type,
  p_entity_type text default null,
  p_entity_id uuid default null
) returns text
language plpgsql security definer set search_path = pg_catalog, public
as $fn$
declare
  v_rule public.numbering_rules%rowtype;
  v_period text;
  v_seq integer;
  v_formatted text;
  v_now timestamptz := now();
begin
  if app.current_user_id() is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select * into v_rule
  from public.numbering_rules
  where document_type = p_document_type and state = 'approved'
  limit 1;

  if not found then
    raise exception 'No approved numbering rule exists for document type %', p_document_type
      using errcode = 'no_data_found';
  end if;

  v_period := case v_rule.reset_period
    when 'never'   then 'ALL'
    when 'yearly'  then to_char(v_now, 'YYYY')
    when 'monthly' then to_char(v_now, 'YYYYMM')
  end;

  -- Serialises concurrent allocation for this counter. Released at commit.
  perform pg_advisory_xact_lock(hashtextextended(p_document_type::text || '|' || v_period, 0));

  select coalesce(max(sequence), v_rule.sequence_start - 1) + 1
    into v_seq
  from public.internal_references
  where document_type = p_document_type and period_key = v_period;

  -- Longer tokens are substituted first so that {YYYY} is not consumed by {YY}.
  v_formatted := v_rule.pattern;
  v_formatted := replace(v_formatted, '{PREFIX}', v_rule.prefix);
  v_formatted := replace(v_formatted, '{YYYY}', to_char(v_now, 'YYYY'));
  v_formatted := replace(v_formatted, '{YY}',   to_char(v_now, 'YY'));
  v_formatted := replace(v_formatted, '{MM}',   to_char(v_now, 'MM'));
  v_formatted := replace(v_formatted, '{M}',    ltrim(to_char(v_now, 'MM'), '0'));
  v_formatted := replace(v_formatted, '{SEQ}',  lpad(v_seq::text, v_rule.sequence_padding, '0'));

  insert into public.internal_references (
    document_type, period_key, sequence, formatted, entity_type, entity_id, issued_by, issued_at
  ) values (
    p_document_type, v_period, v_seq, v_formatted, p_entity_type, p_entity_id,
    app.current_user_id(), v_now
  );

  return v_formatted;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Grants. Repeated here because 0001 could only cover functions that existed
-- at the time it ran.
-- ---------------------------------------------------------------------------
grant execute on all functions in schema app to hagroup_app;
alter default privileges in schema app grant execute on functions to hagroup_app;
