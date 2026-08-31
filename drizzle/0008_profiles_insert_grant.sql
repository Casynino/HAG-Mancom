-- ===========================================================================
-- Creating a user failed with "permission denied for table profiles".
--
-- 0002 granted INSERT on a named subset of columns. Postgres checks column
-- privileges against every column *named in the statement*, and the ORM names
-- all of them — including the ones it sets to DEFAULT. Any column left out of
-- the grant therefore fails the whole insert.
--
-- The property that actually matters here is that password_hash cannot be
-- READ. That is a SELECT concern, and the column-level SELECT grant from 0002
-- is left exactly as it was. INSERT is widened to the table so an Administrator
-- can create an account with an initial hash.
--
-- UPDATE stays column-scoped and still excludes password_hash: a password may
-- only change through app.set_password(), which is SECURITY DEFINER and makes
-- its own authorisation check.
-- ===========================================================================

grant insert on public.profiles to hagroup_app;
