# ERP Session Handoff

_Context package for continuing this work in a new (cloud) session. Written 2026-07-10._

## TL;DR

Custom furniture ERP app (Next.js + Supabase) that **intentionally shares one Supabase
project, auth, and role system with a separate "mill list" app** owned by a colleague.
Over this session we: sorted out a git/GitHub push, ran DB migrations 00001–00005, hit
(and diagnosed) a "wiped database" scare that was actually a paused wrong project,
confirmed the migrations landed on the shared mill-list project, audited and tightened
the `erp` schema RLS via a new migration 00006, and are now getting the Vercel-deployed
app to actually read the `erp` schema.

**Current open item:** the mill-list project owner (colleague) needs to check `erp` under
Supabase → Project Settings → API → **Exposed schemas** and save, so PostgREST will serve
the schema. Until then the app errors with "erp schema is invalid". The user has talked to
them about the schema and will ask them to change the API setting.

---

## Repo / environment facts

- **Local repo path:** `C:\Users\Hunter Johnson\Downloads\erp-scaffold_1\erp`
  (Windows, PowerShell primary shell; git-bash available.)
- **GitHub remote:** https://github.com/hjohnson2933/ERP.git (branch `main`).
- Pushes work via the local Windows git credential manager over HTTPS.
  `gh` CLI is **not** installed; no GitHub API access, only plain git.
- Commit identity set locally to `Hunter Johnson <johnson.1258@icloud.com>`.
- **Supabase CLI is not installed** in the local environment — all DB work has been done
  by pasting SQL into the Supabase dashboard **SQL Editor** (runs as a superuser/service
  connection, which matters for testing — see "Verification gaps" below).

## Architecture: how the ERP is wired to the mill list

From the repo `README.md` — this coupling is **by design**, not accidental:

- **Same Supabase project** as the mill list. `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are meant to be the exact same values the mill list uses.
- **Same auth.** Logging into the ERP authenticates against the same `auth.users` /
  `public.profiles` the mill list reads. There is **no separate ERP user system**.
- **Same roles.** `src/lib/auth/roles.ts` mirrors the mill list's `Role` type and
  `isEditorRole()` guard. If a role is added to the mill list's `user_role` Postgres enum,
  it must be added here too or the two apps silently disagree on permissions.
- **Separate schema.** All ERP tables live in a dedicated `erp` Postgres schema, distinct
  from the mill list's `public` schema. ERP tables soft-reference `public.jobs` /
  `public.profiles` by plain uuid columns — **no cross-schema foreign keys** — which is
  what would make a future extraction to a standalone project "migrate one schema" rather
  than "untangle shared tables."

### App wiring specifics
- `src/lib/supabase/erp-client.ts` is **not** a second Supabase project connection — it's
  just `supabase.schema("erp")` on the same client. Requires `erp` to be in Supabase's
  "Exposed schemas" list or all queries fail (this is the current blocker).
- `src/lib/supabase/client.ts` — standard browser client, single project URL/anon key.
- The dashboard **Jobs** tab reads `public.jobs` directly (same-DB query), which is the
  end-to-end proof that the shared connection works.
- `src/lib/auth/roles.ts` — 8 roles: `admin, pm, prog, cnc, carpenter, installer,
  foreman, cnc_manager`. Key guards mirrored from DB:
  - `isEditorRole` → admin, pm, prog, cnc, foreman, cnc_manager
  - `canManageOrders` → admin, pm (mirrors `erp.can_manage_orders()`)
  - `canViewStockReservations` → admin, pm, foreman, cnc_manager
  - `ERP_ROLE_TABS` defines per-role tab visibility (UI only — **not** a security boundary;
    RLS is).

## Git history resolution (done)

- Neither local folder was a git repo; the GitHub remote already had history
  (4 commits ending at `363a54b "Fix route group conflict: rename (dashboard) to dashboard"`).
- Local `erp-scaffold_1/erp` was **ahead** of the remote (had migrations 00002–00005, an
  orders page, and the `dashboard/` route rename) — NOT behind, despite an older-looking
  sibling folder `~/Downloads/erp-scaffold/erp` that we deliberately did **not** copy from.
- Resolution: `git init` in the local folder, committed local state, `git fetch`, then
  `git merge origin/main --allow-unrelated-histories -X ours` (kept local content as
  authoritative, pulled in remote-only `README.md` + `package-lock.json`), then pushed.
  Merge commit `6e391d4`. **No force-push, remote history preserved.** Working tree clean.

## The "database was wiped" scare (resolved — no data loss)

Sequence of what actually happened, for the record:
1. User reported their Supabase project looked completely empty.
2. Diagnosed: it was a **Free-tier project that had auto-paused**; restoring it brought it
   back but it was **still blank** — meaning it had always been blank, not wiped.
3. Root cause: it was the **wrong project**. The ERP migrations belong on the **colleague's
   shared mill-list project**, which is a *different* Supabase project. The blank paused one
   was unrelated. No data was ever lost; no backups were needed.

## Migrations

Location: `supabase/migrations/`. Run in order against the **shared mill-list project** via
SQL Editor.

| File | Purpose | Status |
|------|---------|--------|
| `00001_create_erp_schema.sql` | Creates `erp` schema + grants | Applied ✓ |
| `00002_inventory_materials.sql` | `locations, materials, stock_levels, stock_movements` + `apply_stock_movement()` trigger + RLS | Applied ✓ |
| `00003_vendors_and_materials_update.sql` | `vendors` stub, materials columns, `material_stock_summary` view | Applied ✓ |
| `00004_seed_mdf_inventory.sql` | Seeds MDF inventory (idempotent, `on conflict do nothing`) | Applied ✓ |
| `00005_sales_flow.sql` | `brands, customers, order_forms, order_form_items, orders, order_lines`, `next_order_number()`, order RLS | Applied ✓ |
| `00006_tighten_erp_rls.sql` | RLS audit fixes (see below) | Applied ✓ |

Verified all 6 sales-flow + inventory tables plus views exist in the `erp` schema.
`select erp.next_order_number()` returns sequential values (`A00001`, `A00002`, `A00003`…).

### Dependencies on the mill list (external, not in this repo)
The ERP migrations call these `public.*` objects that live in the **mill list's own**
(unseen-by-us) migrations. If assumptions about them are wrong, RLS behaves differently
than intended:
- `public.set_updated_at()` — trigger fn used by every `_set_updated_at` trigger
- `public.my_role()` — returns caller's role (or null)
- `public.is_editor()`, `public.is_admin()`
- `public.jobs`, `public.profiles` — soft-referenced by uuid

## Migration 00006 — RLS audit (applied)

Audited every `erp.*` policy against `roles.ts`/`ERP_ROLE_TABS`. Findings fixed:

1. **`erp.stock_levels` had no write policy** → the `apply_stock_movement()` trigger's
   upsert would fail for any non-service-role caller (inventory tracking broken). Fixed by
   making `apply_stock_movement()` `SECURITY DEFINER` with locked `search_path` (users
   write `stock_movements`, never `stock_levels` directly).
2. **All reads were `my_role() is not null`** (any authenticated user of either app could
   read everything, including pricing/customers). Tightened:
   - orders/customers/brands/order_forms/order_form_items/order_lines reads → `erp.can_manage_orders()` (admin, pm)
   - locations/materials/stock_levels/stock_movements/vendors reads → new `erp.can_view_materials()` (admin, pm, foreman, cnc_manager)
3. **Pricing-table writes used `is_editor()` (6 roles)** — inconsistent with sibling tables.
   `brands/order_forms/order_form_items` writes aligned to `erp.can_manage_orders()`.
   `materials/vendors/stock_movements` writes aligned to `erp.can_view_materials()`.
4. **`material_stock_summary` view bypassed RLS** (plain view → runs as owner). Fixed with
   `security_invoker = true`.
5. **`erp.order_number_seq` was never granted** to `authenticated`/`service_role` →
   `insert into erp.orders` would fail on the sequence default for real users. Granted.

## Verification gaps (still worth doing)

The SQL Editor runs as a superuser/service connection, so it **bypasses RLS and sequence
grants** — meaning our dashboard tests do NOT prove the fixes work for real app users.
Still to confirm from the actual app, logged in as specific roles:
- As `carpenter`/`installer`: `erp.customers`/`erp.orders`/`erp.materials` should now return
  **empty / permission-denied** (previously returned everything). This is the concrete
  exposure fix.
- As `admin`/`pm`: create an order end-to-end without a sequence permission error.
- As `admin`/`pm`/`foreman`/`cnc_manager`: materials page shows rows.

## Current blocker & next steps

1. **[BLOCKED ON COLLEAGUE]** `erp` is present in the mill-list project's Exposed schemas
   list but **unchecked**, and the user cannot toggle it — almost certainly because their
   org role on the shared project is below Owner/Administrator. The colleague (project
   owner) needs to check `erp` under Project Settings → API → Exposed schemas → Save.
   User has discussed the schema with them and will ask them to flip this setting.
   → Once done, the "erp schema is invalid" error clears and the materials page loads
     (for appropriately-roled users).
2. **`.env.local` for local dev was never created** — deferred during this session. The
   Vercel deployment has its own env vars configured separately. `.env.local` is gitignored.
   Needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` from the mill-list project (Settings → API). Only needed to
   run the app locally.
3. **Verify Vercel env vars** actually point at the mill-list project (open item from
   earlier; not confirmed).
4. Run the role-based verification tests listed under "Verification gaps."

## Decisions made this session
- **Did NOT** copy from the older `~/Downloads/erp-scaffold/erp` sibling folder — it was
  stale and would have reverted newer work.
- **Chose Track B (stay on shared project + tighten RLS)** over a full extraction to a
  separate Supabase project. A real split would require splitting auth (`auth.users` is
  per-project), duplicating the 8-role system, and turning the Jobs-tab DB read into a
  cross-project API call — far more than a schema `pg_dump`. Revisit only if isolation
  becomes a hard requirement.

## What's deliberately not built yet
`customers`, `estimates`, `materials` (as domain UIs) are placeholder pages. Their full
schema is intentionally deferred until real sample exports from iPOL, Sage, and ProjectPAK
are available, to avoid guessing field names and reworking later.

## `erp.order_status` enum (from 00005, for reference)
`order_received, pre_production, ready_for_production_review, ready_for_production,
in_production, ok_to_ship, shipped, installation_complete, invoicing_complete, job_complete`

Orders carry a **soft** `job_id` uuid (no FK) pointing at `public.jobs`; many phased orders
may share one job. The ERP does **not** write to `public.jobs` yet — that handoff is a
future migration requiring a coordinated RLS conversation with the mill-list owner.
