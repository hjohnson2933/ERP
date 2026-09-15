-- ════════════════════════════════════════════════════════════════
-- Public baseline — the mill-list objects the ERP used to borrow
-- ════════════════════════════════════════════════════════════════
-- Until now the ERP shared ONE Supabase project with the mill list and
-- leaned on objects the mill list owned in the `public` schema:
--   • the user_role enum          • public.profiles / public.jobs
--   • public.my_role()            • public.is_editor() / is_admin()
--   • public.set_updated_at()     • a new-user -> profile trigger
-- Every later migration (00002+) and every dashboard page assumes these
-- already exist. On a standalone ERP Supabase project they don't, so
-- this migration recreates them — a self-contained equivalent of what
-- the mill list provided — and MUST run before 00001. Its `00000`
-- prefix sorts it first, in the SQL Editor and in the test harness.
--
-- This is the "stand on its own" migration: after it (plus the rest of
-- the chain) is applied to the new project, the ERP no longer depends
-- on the mill-list project for anything.
--
-- SAFE TO RE-RUN. Idempotent throughout (guarded enum creation,
-- create-or-replace functions, drop-policy-before-create). It does NOT
-- copy any mill-list data — the standalone project starts empty, with
-- fresh logins, by design.
-- ════════════════════════════════════════════════════════════════

-- ─── Enums ──────────────────────────────────────────────────────
-- The 8 roles mirror src/lib/auth/roles.ts. If a role is ever added,
-- add it here (alter type ... add value) AND in roles.ts, or the app
-- and DB will disagree about who can do what.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum
      ('admin', 'pm', 'prog', 'cnc', 'carpenter', 'installer', 'foreman', 'cnc_manager');
  end if;
end $$;

-- Job lifecycle, mirrors JobStatus in src/lib/types/shared.ts.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type public.job_status as enum
      ('hold', 'partial', 'approval', 'ready', 'inmill', 'complete');
  end if;
end $$;

-- ─── set_updated_at() ───────────────────────────────────────────
-- The trigger fn every *_set_updated_at trigger in the erp schema calls.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── profiles ───────────────────────────────────────────────────
-- One row per auth user. `id` equals auth.users.id (populated by the
-- handle_new_user trigger below). No cross-schema FK by design — the
-- same soft-reference philosophy the erp schema uses for public.jobs /
-- public.profiles — so nothing here couples to the auth schema's shape.
create table if not exists public.profiles (
  id         uuid primary key,
  full_name  text        not null default '',
  initials   text        not null default '',
  role       public.user_role not null default 'carpenter',
  active      boolean     not null default true,
  created_at timestamptz not null default now()
);

-- ─── jobs ───────────────────────────────────────────────────────
-- The dashboard Jobs tab reads exactly these columns
-- (src/app/dashboard/jobs/page.tsx). deleted_at is a soft delete.
create table if not exists public.jobs (
  id           uuid primary key default gen_random_uuid(),
  job_number   text not null,
  client       text not null default '',
  title        text not null default '',
  install_date date,
  status       public.job_status not null default 'hold',
  assigned_to  uuid,                       -- soft ref to public.profiles.id
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ─── Role helpers ───────────────────────────────────────────────
-- SECURITY DEFINER so they can read public.profiles regardless of the
-- caller's RLS; search_path locked to public. These are the exact
-- guards the erp schema's policies call, and their TS mirrors live in
-- src/lib/auth/roles.ts — keep the two in sync.
create or replace function public.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.my_role() = 'admin';
$$;

-- Mirrors isEditorRole() in src/lib/auth/roles.ts exactly.
create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.my_role() in ('admin', 'pm', 'prog', 'cnc', 'foreman', 'cnc_manager');
$$;

-- ─── New-user -> profile ────────────────────────────────────────
-- Fires when a login is created in Supabase Auth. Since logins start
-- fresh on the standalone project, this is how a profile comes into
-- existence. Role defaults to 'carpenter' (least privilege) unless the
-- user's metadata carries a role; promote the first admin with the
-- block at the bottom of this file. full_name / initials come from
-- auth metadata when present.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, initials, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'initials', ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role,
      'carpenter'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── RLS ────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.jobs     enable row level security;

-- Any signed-in user can read profiles (the app resolves the current
-- user's role and looks up other users' names). Only admins manage
-- them; the handle_new_user trigger inserts as SECURITY DEFINER, so it
-- is not blocked by the admin-only write policy.
drop policy if exists profiles_read  on public.profiles;
drop policy if exists profiles_write on public.profiles;
create policy profiles_read  on public.profiles for select using (auth.uid() is not null);
create policy profiles_write on public.profiles for all    using (public.is_admin()) with check (public.is_admin());

-- Jobs: any role can read; editors manage. Mirrors the erp schema's
-- read/write split.
drop policy if exists jobs_read  on public.jobs;
drop policy if exists jobs_write on public.jobs;
create policy jobs_read  on public.jobs for select using (public.my_role() is not null);
create policy jobs_write on public.jobs for all    using (public.is_editor()) with check (public.is_editor());

-- ─── Grants ─────────────────────────────────────────────────────
grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.jobs     to authenticated;
grant all on public.profiles to service_role;
grant all on public.jobs     to service_role;

grant execute on function public.my_role()        to authenticated, service_role;
grant execute on function public.is_admin()        to authenticated, service_role;
grant execute on function public.is_editor()       to authenticated, service_role;
grant execute on function public.set_updated_at()  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- Promote the first admin (run AFTER creating your login in
-- Supabase → Authentication → Users). Replace the email, then run:
--
--   update public.profiles p
--      set role = 'admin', active = true
--     from auth.users u
--    where u.id = p.id
--      and u.email = 'you@example.com';
--
-- Re-run any time to change a role. There is deliberately no in-app
-- role admin UI — roles are set here, matching how labor rates are set
-- at the bottom of 00016.
-- ════════════════════════════════════════════════════════════════
