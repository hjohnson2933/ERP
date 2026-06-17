-- ════════════════════════════════════════════════════════════════
-- ERP — initial schema setup
-- Creates a dedicated `erp` Postgres schema, separate from the mill
-- list's `public` schema, in the SAME Supabase project. This keeps
-- the suite on one database (no sync layer) while keeping a clean
-- boundary that's easy to split into its own project later.
--
-- Reuses the mill list's existing public.profiles table, public.user_role
-- enum, and public.my_role()/is_editor()/is_admin() functions for auth —
-- do NOT create a parallel user/role system here.
-- ════════════════════════════════════════════════════════════════

create schema if not exists erp;

grant usage on schema erp to authenticated, service_role;

-- Default privileges so future erp.* tables are usable by these roles
-- without re-granting every time a table is added.
alter default privileges in schema erp
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema erp
  grant all on tables to service_role;

-- Domain tables (erp.customers, erp.estimates, erp.materials, ...) are
-- intentionally NOT created here. Add them in a follow-up migration
-- once real field names are confirmed from iPOL / Sage / ProjectPAK
-- exports, using soft references (plain uuid columns, no FK constraint)
-- to public.jobs / public.profiles rather than cross-schema foreign keys.
--
-- Query erp.* tables with explicit schema qualification from the app,
-- e.g. supabase.schema('erp').from('customers'), rather than relying
-- on search_path — keeps this fully isolated from the mill list's
-- queries and avoids any database-wide setting that could affect it.
