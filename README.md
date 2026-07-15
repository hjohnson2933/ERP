# ERP

Custom furniture ERP, built to share its Supabase project, auth, and
role system with the mill list app rather than running as a separate
backend.

## How this is wired to the mill list

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

## Setup

1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in the three
   Supabase values.
3. Run the migration in `supabase/migrations/00001_create_erp_schema.sql`
   against the shared Supabase project (via the SQL Editor, or the
   Supabase CLI if the mill list repo already uses one).
4. `npm run dev` and sign in with an existing mill list user — the
   /dashboard/jobs page should immediately show the same jobs from
   the mill list app, confirming the connection works end to end.

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
