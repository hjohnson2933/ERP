-- ════════════════════════════════════════════════════════════════
-- ERP — initial schema setup
-- Creates a dedicated `erp` Postgres schema in the SAME Supabase
-- project as the mill list. Reuses public.profiles, public.user_role,
-- and public.my_role()/is_editor()/is_admin() for auth.
-- ════════════════════════════════════════════════════════════════

create schema if not exists erp;

grant usage on schema erp to authenticated, service_role;

alter default privileges in schema erp
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema erp
  grant all on tables to service_role;

-- Domain tables added in subsequent migrations.
-- Query erp.* tables with explicit schema qualification from the app,
-- e.g. supabase.schema('erp').from('materials'), rather than relying
-- on search_path — keeps this fully isolated from the mill list.
