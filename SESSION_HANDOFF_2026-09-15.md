# ERP — Session Handoff (2026-09-15) — **standalone database**

_Companion to the earlier handoffs. This one covers making the ERP
stand on its own Supabase project instead of borrowing from the mill
list. Read `SESSION_HANDOFF_2026-07-15.md` for the domain/model context;
nothing there is invalidated._

## What changed this session

The ERP used to share ONE Supabase project with the mill list and lean
on objects the mill list owned in the `public` schema. A **new, separate
Supabase project now exists for the ERP**, and the goal was to let the
app run on it with no dependency on the mill-list project.

Decisions (from the owner):
- **New project already exists** — this repo just needed to be able to
  build a self-contained DB on it.
- **Logins reset fresh** — no cross-project auth migration; users are
  recreated on the new project.
- **Schema only / start fresh** — no bulk copy of mill-list rows.

### The one code change: `00000_public_baseline.sql`

New migration `supabase/migrations/00000_public_baseline.sql` (sorts
FIRST, before `00001`) recreates everything the ERP used to borrow:

- `public.user_role` enum (8 roles, mirrors `src/lib/auth/roles.ts`)
- `public.job_status` enum (mirrors `JobStatus` in `types/shared.ts`)
- `public.profiles` — exact columns the app reads (`id, full_name,
  initials, role, active, created_at`); `id` = the auth user id, no FK
  (same soft-reference philosophy the `erp` schema uses)
- `public.jobs` — exact columns the Jobs tab reads, incl. `deleted_at`
  soft delete + an `updated_at` trigger
- `public.my_role()` / `is_admin()` / `is_editor()` — SECURITY DEFINER,
  profiles-backed, the guards every `erp.*` RLS policy calls
- `public.set_updated_at()` — the trigger fn the `erp` schema uses
- `public.handle_new_user()` + `on_auth_user_created` trigger — a new
  Supabase Auth user gets a profile automatically, at least-privilege
  `carpenter`
- RLS + grants on `profiles` and `jobs`

It is idempotent (safe to re-run) and copies no data — the project
starts empty with fresh logins, by design.

The test harness (`supabase/tests/harness.mjs`) was updated to stop
stubbing the objects `00000` now creates for real; it still stubs only
what Supabase itself owns (the `auth` schema, grant-target roles,
`auth.uid()`, a stub `auth.users`). All **53** existing checks still
pass, and the full chain applies cleanly with `00000` at the front.

## Deploy steps (for the owner — non-technical)

On the **new** ERP Supabase project (NOT the mill-list one):

1. Point Vercel's env vars (and any local `.env.local`) at the new
   project — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` from Settings → API.
2. In the SQL Editor, run every file in `supabase/migrations` **in
   order, starting at `00000`**. `00000` must go first.
3. Set the labor rates via the `UPDATE` block at the bottom of `00016`
   (all 13 types seed at $0.00).
4. Create your login under **Authentication → Users → Add user**, then
   run the promote-to-admin block at the bottom of `00000` (edit the
   email first).
5. Sign in. The dashboard is now reading the ERP's own database.

## Notes / open items

- `erp` no longer needs to be added to "Exposed schemas" by a colleague
  — on a project you own you can toggle it yourself if a query reports
  the schema isn't exposed. This retires the old cross-owner blocker.
- No mill-list data was copied. If specific jobs/customers ever need to
  come over, that's a separate export/import against both live
  databases (needs credentials to both) — out of scope here.
- Everything from `SESSION_HANDOFF_2026-07-15.md` §8 (estimate→order
  conversion, retiring `assembly_costs.unit_cost`, a rates UI, real-RLS
  verification) is still open and unaffected.
