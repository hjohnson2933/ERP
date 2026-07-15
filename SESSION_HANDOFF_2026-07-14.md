# ERP — Session Handoff (2026-07-14, batch 2)

> ## ⚠️ SUPERSEDED — read `SESSION_HANDOFF_2026-07-15.md` instead
>
> Batch 2 is **complete** (all 5 stages shipped 2026-07-15); §6 below describes it
> as in progress. More importantly, **§1 is now wrong**: it says deploy is
> patch-based via `git am` on branch `claude/erp-session-handoff-u0um03`, which was
> true only of the read-only build sandbox that wrote this doc. The working copy is
> on `main` with a real push remote — work is committed directly, and handing over a
> patch makes `git am` fail. Kept for historical context only.

_Context package to continue this work in a fresh coding session. Companion to
`ERP_SESSION_HANDOFF.md` (architecture, 2026-07-10) and `PROGRESS_2026-07-14.md`
(the first half of today). This doc captures the **current state** and the
**in-progress update batch** (ERP_Updates_r2)._

---

## 1. How this project is worked on (read first)

- **Repo:** Next.js 14 (App Router) + Supabase. Branch: **`claude/erp-session-handoff-u0um03`**.
- **Deploy is patch-based.** The build environment's GitHub token is **read-only**, so
  nothing can be pushed from here. Each change is delivered to the owner as a
  `git am` **patch file** + (when needed) a **Supabase SQL migration** the owner runs
  manually in the SQL Editor. The owner applies + pushes; then confirms.
- **The owner is non-technical.** Keep deploy steps to: move patch into repo → `git am X.patch`
  → `git push` → run the migration SQL in Supabase. Offer to paste SQL if asked.
- **Verify with a PRODUCTION build, not dev.** A real bug (BOM override highlight) only
  appeared in `next build` because Tailwind orders CSS differently than dev. Verification
  loop per change: read files → write migration/types/action/form/pages → `tsc --noEmit`
  → `npm run build` (dummy env) → `npm start` → drive with Playwright/Chromium → screenshot →
  clean up → commit → `git format-patch -1 HEAD`.
- **Screenshot technique:** there is no auth in the sandbox, so renders use a **temporary**
  `src/app/preview/page.tsx` that mounts the target component with mock props, plus a
  **temporary** whitelist of `/preview` in `src/lib/supabase/middleware.ts`. Both are
  reverted/deleted before committing (they must never land in a patch). Chromium is at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; drive localhost with `--noproxy`.
- **Commits:** `git config user.email noreply@anthropic.com && git config user.name Claude`.
  The stop-hook "Unverified signature" warning is **unfixable here** (no signing key) and
  **not actionable** — ignore it every time.
- **Gitignored:** `next-env.d.ts`, `*.tsbuildinfo`, `*.patch`, `.next`, `node_modules`, `.env*.local`.

## 2. Architecture (unchanged from 07-10)

- Shares ONE Supabase project/auth/roles with a separate **mill-list** app. All ERP tables
  live in the **`erp`** Postgres schema. `NEXT_PUBLIC_SUPABASE_*` = the mill-list values.
- The `erp` schema **is exposed** in Supabase now (earlier blocker resolved).
- **8 roles** (`src/lib/auth/roles.ts`), mirroring mill-list. DB guard functions + their
  TS mirrors (keep in sync):
  - `can_manage_orders()` / `canManageOrders` → admin, pm (customers, brands writes)
  - `can_manage_estimates()` / `canManageEstimates` → admin, pm
  - `can_manage_catalog()` / `canManageCatalog` → admin, pm (programs, assemblies)
  - `can_view_materials()` / `canManageMaterials` (+ `canViewStockReservations`) → admin, pm, foreman, cnc_manager
- **App patterns:** server components read via `erpSchema()` (= `supabase.schema("erp")`);
  writes are Next **server actions** + a reusable **client form**; each module is a
  `list` + `new` + `[id]/edit` route trio. Child rows (BOM lines, estimate lines) use
  **delete-all-then-reinsert** on edit. Computed reads use **`security_invoker` views**.
  RPCs called via `erpSchema().rpc(...)`.

## 3. The domain model (as built)

`Part (= material)` → `Assembly` (BOM of parts + child assemblies; recursive cost roll-up;
cycle-protected) → `Fixture` (a finished assembly, `is_fixture`, in exactly one program) →
`Program` (a brand's active fixtures) → `Estimate` (collection of **fixtures** at a markup,
plus **custom** lines; submit **locks** pricing into a snapshot; re-price compares).

## 4. Migrations 00001–00015 (run in order in Supabase SQL Editor)

`00001` erp schema · `00002` inventory/materials · `00003` vendors + material_stock_summary
· `00004` seed MDF · `00005` sales flow (brands/customers/order_forms/orders) · `00006` RLS
audit · `00007` estimates · `00008` estimate material lines + estimate_line_details view ·
`00009` programs/assemblies/assembly_components + `assembly_unit_cost()` recursive roll-up +
`assembly_costs` view + cycle-check trigger + `can_manage_catalog()` · `00010` estimate
markup + fixtures (rebuilt estimate_line_details) · `00011` BOM `unit_cost_override` ·
`00012` estimate price-lock (estimate_snapshots + snapshot_lines + `lock_estimate()` +
estimate_totals view) · `00013` `brands.brand_code` ("Brand ID") · `00014` assembly custom
BOM lines (`assembly_components.description`; relaxed one-target check) · `00015` material
`thickness/width/length` + rebuilt material_stock_summary (adds active + dims).

**All 00001–00015 are applied to the live DB** (owner confirmed through 00013; 00014/00015
are the current batch — see §6, owner applies as each stage ships).

## 5. Modules currently live

- **Customers** (CRUD), **Brands** (CRUD + Brand ID column/field), **Programs** (CRUD),
  **Assemblies/Fixtures** (builder: material/sub-assembly/**custom** BOM lines, per-line
  cost **override** highlighted light-orange w/ ↺ reset, category grouping, live roll-up,
  fixture→program), **Materials** (list w/ **search-all-attributes** + **sortable** columns
  + Size col; create/edit **form** w/ wood dimensions), **Estimates** (fixtures + custom
  lines; estimate-wide markup + per-line override; submit→lock snapshot; re-price/unlock;
  locked read-only view w/ prev-vs-current delta).
- Sidebar tabs (admin/pm): Dashboard, Jobs, Orders, Brands, Programs, Assemblies, Customers,
  Estimates, Materials. Chrome = navy (`#37465f`) + burnt-orange (`#c05621`), Inter font,
  Lucide icons (`src/components/nav/icons.tsx`), working Sign out.
- **Orders** is still the OLD `order_forms`/`order_form_items` model — untouched, not yet
  wired to fixtures. **Estimate→Order conversion is deliberately deferred.**

## 6. CURRENT BATCH — "ERP_Updates_r2" (in progress)

Source doc grouped by module; locked decisions + 5-stage plan below. **Stages 1–2 shipped;
3–5 remain.**

### Locked decisions
1. **Labor cost** → central **rate table** (labor line = type + hours; cost = hours × rate, live).
2. **Materials** → build the create/edit form (done in Stage 2).
3. **Estimate markups** → **two** estimate-wide markups (material %, labor %) + per-line
   overrides; **custom lines stay a single typed price** (no split).
4. **Approval** → recorded as **logged-in user + timestamp**.
5. **Re-price** → spawns a **new revision** only when **Approved**; in-place re-price stays
   for locked-but-not-approved.
6. **Revisions** → same base number + `-r2` suffix, linked to the original.
7. **Status lifecycle** → **Draft → Submitted/Locked → Approved (immutable) / Rejected
   (→ Draft + auto note)**; add `approved`, tidy the enum.

### Stage status
- ✅ **Stage 1 (shipped)** — Assembly **custom (non-stock) BOM lines** (migration `00014`) +
  confirmed A2 override highlight, then **fixed** it (`d9d3c8e`): the highlight was
  suppressed in production because the input had both `bg-white` (base `field` class) and
  `bg-accent-soft`; forced with Tailwind `!` + orange text/border. **Lesson: verify styles
  in a production build.**
- ✅ **Stage 2 (shipped)** — Materials form + wood dimensions + search + sort (migration `00015`).
- ⏭️ **Stage 3 (NEXT)** — **Assembly labor** (A3, A4). Biggest stage. Spec:
  - Labor **categories**: General Labor, Fabrication. **Types** — General: CAD, Programming,
    Project Management, Estimation. Fabrication: CNC, Edge Banding, Carpentry, Glass,
    Finishing, Solid Surface, Handling, Layup, Panel Saw.
  - Build a **`erp.labor_types`** lookup (category, name, rate) seeded with the above; and
    **`erp.assembly_labor`** lines (assembly_id, labor_type_id, hours) → cost = hours × rate.
  - Recursive **labor roll-up** through sub-assemblies (parallel to material roll-up):
    add `erp.assembly_labor_cost(id)` (+ maybe hours), and expose **material_cost AND
    labor_cost separately** on `assembly_costs`.
  - AssemblyForm: a Labor section (category → type → hours, live cost + roll-up display).
- ⏭️ **Stage 4** — **Estimate split markup** (E5). Depends on Stage 3. Per-line **material
  cost vs labor cost** shown separately; **two markups** (material %, labor %) estimate-wide
  + per-line overrides; sell = material_cost×(1+mat_mk) + labor_cost×(1+lab_mk). Custom
  lines = single typed price. Update `estimate_line_details` view + snapshots to carry both
  cost components + both markups. (Replaces the single `markup_pct` from `00010`.)
- ⏭️ **Stage 5** — **Estimate approval lifecycle** (E1–E4). Sign-off → **Approved**
  (immutable), reject → **Draft** + auto note "Rejected by [user] at [timestamp]",
  re-price-approved → **new revision draft** (base number + `-r2`, linked via a
  parent/revision field). Reconcile with the existing lock/re-price (`00012`) and status enum.

## 7. Key files for the remaining work

- Assemblies: `src/app/dashboard/assemblies/{page,actions,new,[id]/edit}.tsx`,
  `src/components/assemblies/AssemblyForm.tsx` (BomRow model has `kind: material|assembly|custom`,
  `is_override`, `cost_override`, etc.). Roll-up = `erp.assembly_unit_cost()` in `00009`/`00011`.
- Estimates: `src/app/dashboard/estimates/{page,actions,new,[id]/edit}.tsx`,
  `src/components/estimates/{EstimateForm,EstimatePricing}.tsx`. Pricing view =
  `erp.estimate_line_details` (`00010`), totals = `erp.estimate_totals`, lock =
  `erp.lock_estimate()` (`00012`). Status enum `erp.estimate_status` (`00007`):
  draft/sent/accepted/rejected/expired (add `approved` in Stage 5).
- Types: `src/lib/types/erp.ts`. Guards: `src/lib/auth/roles.ts`.

## 8. Commits this session (newest last)

```
914a26c 00006 to source control        7f1c690 estimates module
731b97c gitignore artifacts            1861f94 Customers CRUD (first write path)
9dcc3c7 Brands CRUD + tab              38613b0 Mill List restyle (navy/orange)
6996c55 nav icons + Inter + colors     21942b3 burnt orange
c7bba41 estimate builder              3f75885 estimate material lines (live price)
1e03565 Exp Stage 1 (programs/asm/BOM) d4aa6d0 Exp Stage 2 (builder + programs UI)
185509a Exp Stage 4 (fixtures+markup)  4e9af6e BOM cost override
0ce3da7 Exp Stage 5 (price lock)       650e9c1 progress log
5c8e6a1 Brand ID                       7cdbd83 Updates Stage 1 (custom BOM lines)
d9d3c8e fix override highlight (prod)  4a810cc Updates Stage 2 (materials)
```

## 9. Immediate next action

Owner deploys `updates-stage2-materials.patch` + migration `00015`, then says **go for
Stage 3** (Assembly labor). Start Stage 3 by designing the labor tables (`labor_types`
seeded lookup + `assembly_labor`) and the parallel labor roll-up, then the AssemblyForm
labor section — this unblocks Stage 4's split markup.
