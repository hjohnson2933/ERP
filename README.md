# ERP

Custom furniture ERP (Next.js + Supabase). It **runs standalone on its
own Supabase project** — its own auth, its own `public` schema, its own
`erp` schema. It began life sharing one project with the mill list app;
`supabase/migrations/00000_public_baseline.sql` recreates the handful of
`public` objects it used to borrow from the mill list (the `user_role`
enum, `public.profiles` / `public.jobs`, the `my_role()` / `is_editor()`
/ `is_admin()` / `set_updated_at()` helpers, and a new-user → profile
trigger), so the whole migration chain builds a self-contained database
with no dependency on the mill-list project.

## Running standalone (current setup)

1. `npm install`
2. Point `.env.local` (and Vercel) at **the ERP's own** Supabase project
   — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` from that project's Settings → API.
3. Run every migration in `supabase/migrations`, **in filename order
   starting at `00000`**, in the Supabase SQL Editor. `00000` must run
   first — the rest of the chain depends on the `public` objects it
   creates. `erp` does not need to be added to "Exposed schemas" the way
   the shared setup did; on a project you own you can toggle it yourself
   under Settings → API if a query reports the schema is not exposed.
4. Create your login under **Authentication → Users** (Add user). A
   profile row is created automatically at the least-privilege
   `carpenter` role. Promote yourself to admin with the ready-to-run
   block at the bottom of `00000_public_baseline.sql` (edit the email,
   run it). Roles are set in SQL — there is deliberately no in-app role
   admin UI, matching how labor rates are set (bottom of `00016`).
5. `npm run dev`, sign in, and the /dashboard/jobs page reads the ERP
   project's own `public.jobs` (empty until you add jobs).

## History: how this used to be wired to the mill list

- **Same Supabase project.** Set `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the exact same values the mill
  list app uses (Project Settings > API in the Supabase dashboard).
- **Same auth.** Logging in here authenticates against the same
  `auth.users` / `public.profiles` table the mill list reads. There is
  no separate ERP user system.
- **Same roles.** `src/lib/auth/roles.ts` mirrors the mill list's
  `Role` type and `isEditorRole()` guard. If a role is ever added to
  the `user_role` Postgres enum, add it here too, or the two apps will
  silently disagree about who can do what.
- **Separate schema.** `supabase/migrations/00001_create_erp_schema.sql`
  creates an `erp` Postgres schema, distinct from the mill list's
  `public` schema. ERP-owned tables (customers, estimates, materials)
  belong there, soft-referencing `public.jobs` / `public.profiles` by
  plain uuid columns — no cross-schema foreign keys. This is what
  makes splitting the ERP into its own Supabase project later a matter
  of migrating one schema, not untangling shared tables.

The bullets above are the original design intent, kept for context.
Auth, profiles, roles, and jobs now live in the ERP's own project (see
"Running standalone"); `src/lib/auth/roles.ts` still mirrors the
`public.user_role` enum, so a role added in one place must be added in
the other.

## Testing migrations before running them

Migrations are applied by hand in the Supabase SQL Editor, so a broken
one is only discovered when it is pasted in and fails — and neither
`tsc` nor `next build` can see SQL at all.

```
npm run test:migrations
```

This applies every migration in `supabase/migrations`, in order, to a
real throwaway Postgres (pglite — Postgres compiled to WASM, so there is
no server or Docker to install), then asserts the costing and pricing
rules: the material and labor roll-ups, the split markup, and that a
locked estimate ignores later cost changes. Run it after writing or
editing any migration, before pasting the file into Supabase.

If it prints `FAIL` next to a filename, the error shown is the same one
Supabase would give you. Fix it first.

When adding a migration that changes costing or pricing, add a case for
the new rule to `supabase/tests/run.mjs` — the assertions are what stop
a future change from silently re-pricing existing work.

## What's deliberately not built yet

`customers`, `estimates`, and `materials` are placeholder pages. The
domain schema for those is intentionally not designed until we have a
real sample export from iPOL, Sage, and ProjectPAK — see the
conversation history for why guessing field names ahead of that would
likely mean rework.
