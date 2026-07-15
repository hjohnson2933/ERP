# ERP — Session Handoff (2026-07-15) — **batch 2 complete**

_Context package for a fresh coding session. **This supersedes
`SESSION_HANDOFF_2026-07-14.md`**, whose "how this is worked on" section is now
actively wrong (see §1). Companions: `ERP_SESSION_HANDOFF.md` (architecture,
2026-07-10) and `PROGRESS_2026-07-14.md` (the 07-14 work)._

**Where things stand:** the `ERP_Updates_r2` batch (all 5 stages) is **built,
verified, and committed**. What remains is the owner running migrations
`00016`–`00018` in Supabase and setting the labor rates.

---

## 1. How this project is worked on (read first — this changed)

- **Repo:** Next.js 14 (App Router) + Supabase. Branch: **`main`**, real push
  remote (`github.com/hjohnson2933/ERP`).
- **Commit directly. Do NOT generate patches.** The 07-14 handoff says deploy is
  patch-based via `git am`, because that session ran in a sandbox with a
  read-only token that *couldn't* commit. **That is no longer true.** On this
  machine, work is committed straight to `main` and the owner runs `git push`.
  Handing over a patch for an already-committed change makes `git am` fail with
  `previous rebase directory .git/rebase-apply still exists` — this happened on
  07-15. `git am --abort` clears it harmlessly.
- **Do not push without asking.** The deploy decision is the owner's.
- **Migrations are run BY THE OWNER, BY HAND**, in the Supabase SQL Editor. They
  are never applied from here.
- **Run `npm run test:migrations` before handing any migration over.** See §7.
  `tsc` and `next build` cannot see SQL at all — `00017` typechecked, built,
  rendered correctly, and still failed the moment it was pasted into Supabase.
- **The owner is non-technical.** Keep deploy steps to: `git push` → paste the
  migration into the SQL Editor. Offer to paste SQL if asked.
- **Verify UI in a PRODUCTION build, not dev.** A real bug (BOM override
  highlight) only appeared under `next build`, because Tailwind orders CSS
  differently than dev. Loop: read files → write migration/types/action/form →
  `npm run test:migrations` → `tsc --noEmit` → `npm run build` (dummy env) →
  `npx next start` → drive it → clean up → commit.
- **Screenshot/render technique:** there is no auth in this environment, so
  renders use a **temporary** `src/app/preview/page.tsx` mounting the target
  component with mock props, plus a **temporary** `/preview` whitelist in
  `src/lib/supabase/middleware.ts`. **Both must be deleted/reverted before
  committing** — they must never land in a commit. Revert the middleware with
  `git checkout -- src/lib/supabase/middleware.ts`.
  - Screenshots via the browser tool time out on this machine. Use
    `get_page_text` and `javascript_tool` (computed styles) instead — for
    checking *whether a style survived the production build*, reading
    `getComputedStyle` is more precise than eyeballing a screenshot anyway.
- **`npm install` is needed** (no `node_modules` checked in). It dirties
  `package-lock.json` with a **CRLF-only change** (empty `git diff`) — leave that
  unstaged.
- **Commits:** `git config user.email noreply@anthropic.com && git config user.name Claude`.
  The stop-hook "Unverified signature" warning is unfixable here and not
  actionable — ignore it.
- **Gitignored:** `next-env.d.ts`, `*.tsbuildinfo`, `*.patch`, `.next`,
  `node_modules`, `.env*.local`.

## 2. Architecture (unchanged)

- Shares ONE Supabase project/auth/roles with the separate **mill-list** app. All
  ERP tables live in the **`erp`** Postgres schema; `NEXT_PUBLIC_SUPABASE_*` are
  the mill-list values. The `erp` schema is exposed in Supabase.
- **8 roles** (`src/lib/auth/roles.ts`), mirroring mill-list. DB guard functions
  and their TS mirrors **must be kept in sync**:
  - `can_manage_orders()` / `canManageOrders` → admin, pm
  - `can_manage_estimates()` / `canManageEstimates` → admin, pm
  - `can_manage_catalog()` / `canManageCatalog` → admin, pm
  - `can_view_materials()` / `canManageMaterials` (+ `canViewStockReservations`)
    → admin, pm, foreman, cnc_manager
- **App patterns:** server components read via `erpSchema()` (= `supabase.schema("erp")`);
  writes are Next **server actions** + a reusable **client form**; each module is
  a `list` + `new` + `[id]/edit` route trio. Child rows (BOM lines, labor lines,
  estimate lines) use **delete-all-then-reinsert** on edit. Computed reads use
  **`security_invoker` views**. RPCs via `erpSchema().rpc(...)`.

## 3. Domain model

`Part (= material)` → `Assembly` (BOM of parts + child assemblies + custom lines,
**plus labor lines**; recursive cost roll-up, cycle-protected) → `Fixture` (a
finished assembly, `is_fixture`, in exactly one program) → `Program` (a brand's
active fixtures) → `Estimate` (fixtures at **two markups** + custom lines; submit
**locks** pricing into a snapshot; **approve** freezes it for good; **revise**
spawns `-r2`).

**Cost is two components everywhere: material and labor.** They roll up
separately and are marked up separately. This is the spine of the whole batch.

## 4. Migrations `00001`–`00018`

`00001` erp schema · `00002` inventory/materials · `00003` vendors +
material_stock_summary · `00004` seed MDF · `00005` sales flow · `00006` RLS audit
· `00007` estimates · `00008` estimate material lines · `00009`
programs/assemblies/BOM + `assembly_unit_cost()` roll-up + `assembly_costs` view +
cycle trigger · `00010` estimate markup + fixtures · `00011` BOM
`unit_cost_override` · `00012` price lock (snapshots + `lock_estimate()` +
`estimate_totals`) · `00013` `brands.brand_code` · `00014` assembly custom BOM
lines · `00015` material dimensions · **`00016` assembly labor** · **`00017`
estimate split markup** · **`00018` estimate approval**.

### Deploy status — IMPORTANT
| Migration | Status |
|---|---|
| `00001`–`00015` | applied (owner confirmed) |
| **`00016`** | **applied** — owner confirmed "stage 3 is up and running" |
| **`00017`** | **NOT confirmed.** First attempt errored (bug, since fixed in `19854b4`); the corrected file needs running. It is safe to re-run from any state. |
| **`00018`** | **not run yet** |

**After `00016`, the labor rates must be set.** All 13 types seed at **$0.00/hr**,
so labor costs nothing until then (the UI says so explicitly and still records
hours). The bottom of `00016` has a ready-to-run `UPDATE` block listing every
type — fill in the numbers and run it. It is safe to re-run, and it is also how a
rate is changed later. **There is deliberately no rates UI** (owner's choice:
edit in the SQL Editor).

## 5. Modules live

- **Customers**, **Brands** (+ Brand ID), **Programs**, **Materials** (search-all
  + sortable + wood dimensions + create/edit form).
- **Assemblies/Fixtures** — BOM builder (material / sub-assembly / **custom**
  lines, per-line cost **override** highlighted light-orange w/ ↺ reset, category
  grouping) **+ a Labor section** (category → type → hours, live cost, rolled-up
  hours + cost, warning when a type has no rate). List shows Material / Labor /
  Total.
- **Estimates** — fixtures + custom lines; **two estimate-wide markups (material %,
  labor %)** with per-line overrides (highlighted like BOM overrides); submit →
  lock snapshot; **approve / reject**; **revisions**; locked read-only view with
  prev-vs-current delta and the cost split.
- Sidebar (admin/pm): Dashboard, Jobs, Orders, Brands, Programs, Assemblies,
  Customers, Estimates, Materials. Navy `#37465f` + burnt-orange `#c05621`, Inter,
  Lucide icons.
- **Orders is still the OLD `order_forms`/`order_form_items` model** — untouched,
  not wired to fixtures. **Estimate→Order conversion is still deliberately deferred.**

## 6. Batch 2 (`ERP_Updates_r2`) — **all 5 stages shipped**

| Stage | What | Migration | Commit |
|---|---|---|---|
| 1 | Assembly custom (non-stock) BOM lines | `00014` | `7cdbd83` + fix `d9d3c8e` |
| 2 | Materials form, wood dims, search, sort | `00015` | `4a810cc` |
| 3 | **Assembly labor** — rate table + roll-up | `00016` | `2014a22` |
| 4 | **Estimate split markup** — material vs labor | `00017` | `d6b4963` (+ fix `19854b4`) |
| 5 | **Approval lifecycle** — sign-off, reject, revisions | `00018` | `5a06e6a` |

### Locked decisions (and why)
1. **Labor cost** → central **rate table** (`erp.labor_types`); a line stores only
   type + hours; cost = hours × rate, **live**. **No per-line rate override** —
   the table is the single source of truth.
2. **Rates seed at $0.00**, edited in the Supabase SQL Editor. No rates UI.
3. **Two markups** (material %, labor %) estimate-wide + per-line overrides.
   **Custom lines stay a single typed price** — they have no cost split.
4. **Approval** = logged-in user + timestamp; approved is **immutable**.
5. **Re-price of an APPROVED estimate spawns a new revision.** In-place re-price
   stays for locked-but-not-approved.
6. **Revisions** = same base number + `-r2`, linked to the **ROOT** original (so a
   family is one hop deep). Revising a revision increments (`-r3`), never stacks.
7. **Status lifecycle:** Draft → Sent (submitted/locked) → Approved (immutable) /
   Rejected (→ Draft + auto note). `accepted` was retired into `approved`.

### Judgment calls worth knowing (all pinned by tests)
- **A BOM cost override on a sub-assembly line replaces its MATERIAL cost only —
  its labor still rolls up.** Overriding a sub-assembly's price to a flat number
  must not silently discard the labor needed to build it.
- **`erp.assembly_unit_cost()` was deliberately left material-only** in Stage 3, so
  `00016` could deploy without moving any estimate price. Labor reached estimates
  only in Stage 4, on purpose.
- **`assembly_costs.unit_cost` is a deprecated material-only alias** of
  `material_cost`, kept so `00010`'s view and the pages kept working mid-batch. It
  is now unused for pricing — **safe to retire** in a future migration (see §8).
- **Backfills in `00017`:** live estimates carried the old single markup onto
  *both* components (material pricing preserved exactly; labor starts marked up
  rather than selling at cost). Historical snapshots backfilled `labor_cost = 0`
  and labor markup `0` — which is what they actually froze, so every past locked
  total is unchanged.
- **`00018` rebuilds the status enum** rather than `ALTER TYPE ... ADD VALUE`,
  which cannot be *used* in the same transaction that adds it — and the SQL Editor
  runs the file as one transaction.
- **Approved immutability is enforced by DB triggers**, not just the UI, covering
  update/delete on `estimates` and insert/update/delete on `estimate_lines`
  (because `saveEstimate` deletes and re-inserts lines).

## 7. The migration test harness ← use this

```
npm run test:migrations
```

Applies every migration in order to a **real throwaway Postgres** (pglite =
Postgres compiled to WASM; no server, no Docker), then asserts **53** costing,
pricing and lifecycle rules. Files: `supabase/tests/harness.mjs` (bootstrap +
helpers), `supabase/tests/run.mjs` (the suite). `@electric-sql/pglite` is a
**devDependency** — it does not ship.

- **Why it exists:** `00017` passed `tsc` and `next build` and still failed in
  Supabase, because it dropped a column while a view depended on it. This runs
  the SQL for real, and prints Postgres's own error next to the filename.
- **It is known to actually fail**, not rubber-stamp: reintroducing the `00017`
  ordering bug makes it exit non-zero.
- **Add a case when you touch costing/pricing/lifecycle.** The assertions are what
  stop a future change from silently re-pricing existing work.
- **Limits:** it stubs `public.my_role()` as admin, so it tests **logic, not RLS**.
  Role enforcement still needs a real Supabase check. It sets its own labor rates.

## 8. Open items / next steps

1. **Owner: run `00017` (corrected) and `00018`, and set the labor rates** via the
   `UPDATE` block at the bottom of `00016`. Nothing else is outstanding in code.
2. **Estimate → Order conversion** — still the natural next project. Orders remain
   on the old `order_forms`/`order_form_items` model while estimates use
   fixtures/programs. Needs a design decision on what an order looks like under
   the new model. Now also needs a decision on whether an order can only be raised
   from an **Approved** estimate (the lifecycle now makes that meaningful).
3. **Retire `assembly_costs.unit_cost`** (the deprecated material-only alias) and
   the now-dead `unit_cost` select in the assemblies list page. Small cleanup
   migration + a type change; the harness covers the behaviour.
4. **Legacy estimate lines:** material lines created before Stage 4 convert to
   custom lines (keeping their then-current price) the next time such an estimate
   is edited and saved.
5. **A rates UI** was deliberately declined. If rate edits become frequent, a
   Labor Rates admin page (Materials-module pattern, admin/pm) is the shape.
6. **RLS is untested by the harness.** Worth a real-Supabase pass on the new
   `labor_types` / `assembly_labor` policies and the approval RPCs.
7. `SESSION_HANDOFF_20260714.md` (no dashes) is an untracked CRLF **duplicate** of
   the tracked `SESSION_HANDOFF_2026-07-14.md`. Harmless; delete it if it annoys.

## 9. Commits this session (2026-07-15, newest last)

```
2014a22  Updates Stage 3: assembly labor (rate table + roll-up)
d6b4963  Updates Stage 4: estimate split markup (material vs labor)
19854b4  Fix 00017 dropping markup_pct before its dependent views
dd3078d  Add a migration test harness that runs the SQL for real
5a06e6a  Updates Stage 5: estimate approval lifecycle
```
