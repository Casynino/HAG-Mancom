-- ===========================================================================
-- app.resolve_session returned roles as public.app_role[].
--
-- node-postgres only parses array types it has a built-in OID for. A custom
-- enum array is not one of them, so the driver handed back the raw Postgres
-- literal `{administrator}` as a string — and every permission check that
-- called .some() on it threw.
--
-- Returning text[] instead uses the driver's built-in parser (OID 1009) and
-- arrives in Node as a real array. The values are identical; only the declared
-- type changes. The application casts them back to AppRole, and the enum on
-- user_roles remains the source of truth.
--
-- The return type is part of the signature, so this drops and recreates rather
-- than using CREATE OR REPLACE.
-- ===========================================================================

drop function if exists app.resolve_session(text);

create function app.resolve_session(p_token_hash text)
returns table (
  session_id uuid,
  user_id uuid,
  email text,
  full_name text,
  must_change_password boolean,
  expires_at timestamptz,
  roles text[]
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
             select ur.role::text from public.user_roles ur
             where ur.user_id = p.id and ur.revoked_at is null
             order by ur.role
           ),
           array[]::text[]
         )
  from live
  join public.profiles p on p.id = live.user_id
  where p.is_active;
end
$fn$;

grant execute on function app.resolve_session(text) to hagroup_app;
