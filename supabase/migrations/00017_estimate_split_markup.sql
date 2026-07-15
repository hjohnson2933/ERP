-- ════════════════════════════════════════════════════════════════
-- ERP — estimate split markup: material and labor priced separately.
--
-- Replaces the single markup_pct from 00010 with TWO estimate-wide
-- markups, each overridable per line:
--
--   sell = material_cost × (1 + material_markup)
--        + labor_cost    × (1 + labor_markup)
--
-- Both cost components come from the Stage 3 roll-up
-- (erp.assembly_unit_cost = material, erp.assembly_labor_cost = labor),
-- so a fixture's labor — including labor rolled up from its
-- sub-assemblies — now reaches the estimate for the first time.
--
-- Custom (non-stock) lines stay a single typed sell price: they have no
-- cost split to mark up. Legacy material lines (pre-00010) keep
-- resolving at the live material cost with no markup, as before; they
-- convert to custom lines the next time such an estimate is edited.
--
-- PRICING CHANGE: an unlocked estimate containing fixtures that have
-- labor will re-price upward when this runs, because labor is now part
-- of the sell price. That is the point of this stage. Estimates whose
-- pricing is LOCKED (00012) keep their snapshot and are unaffected.
--
-- Run after 00016.
-- ════════════════════════════════════════════════════════════════

-- This file is safe to re-run: every step is guarded, so it works
-- whether or not an earlier attempt got part-way through.
--
-- Order matters. estimate_line_details reads estimates.markup_pct and
-- estimate_lines.markup_pct, so those columns CANNOT be dropped while
-- the view exists. The views come down first, then the columns, then
-- the views go back up in their new shape.

-- ─── Two markups on the estimate ───────────────────────────────
alter table erp.estimates
  add column if not exists material_markup_pct numeric(6,3) not null default 0;
alter table erp.estimates
  add column if not exists labor_markup_pct numeric(6,3) not null default 0;

-- ─── Two per-line markup overrides ─────────────────────────────
alter table erp.estimate_lines
  add column if not exists material_markup_pct numeric(6,3);
alter table erp.estimate_lines
  add column if not exists labor_markup_pct numeric(6,3);

-- ─── Carry the old single markup onto both components ──────────
-- Today's material pricing is preserved exactly, and labor starts
-- marked up at the same rate rather than silently selling at cost.
-- Tune the labor rate per estimate afterwards.
--
-- Guarded on markup_pct still existing, so re-running this file after
-- the column has already been dropped is a no-op rather than an error.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'erp' and table_name = 'estimates' and column_name = 'markup_pct'
  ) then
    update erp.estimates
    set material_markup_pct = markup_pct,
        labor_markup_pct    = markup_pct
    where markup_pct is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'erp' and table_name = 'estimate_lines' and column_name = 'markup_pct'
  ) then
    update erp.estimate_lines
    set material_markup_pct = markup_pct,
        labor_markup_pct    = markup_pct
    where markup_pct is not null;
  end if;
end $$;

-- ─── Drop the dependent views BEFORE the columns they read ─────
-- estimate_totals reads estimate_line_details, so it comes down first.
drop view if exists erp.estimate_totals;
drop view if exists erp.estimate_line_details;

-- Now the single markup can be dropped: nothing depends on it.
alter table erp.estimates      drop column if exists markup_pct;
alter table erp.estimate_lines drop column if exists markup_pct;

-- ─── Rebuild the pricing views ─────────────────────────────────

create view erp.estimate_line_details
with (security_invoker = true) as
select
  el.id,
  el.estimate_id,
  el.fixture_id,
  el.material_id,
  case
    when el.fixture_id is not null then 'fixture'
    when el.material_id is not null then 'material'
    else 'custom'
  end as kind,
  (el.fixture_id is null and el.material_id is null) as is_custom,
  coalesce(nullif(el.description, ''), asm.name, m.name, '') as description,
  coalesce(asm.assembly_number, m.sku) as sku,
  el.quantity,
  p.unit_price,
  -- Cost components per unit. Fixtures carry both; legacy material lines
  -- are material-only; custom lines have no cost to split.
  (case
    when el.fixture_id is not null then c.mc
    when el.material_id is not null then c.mc
    else null
  end)::numeric(12,2) as material_cost,
  (case when el.fixture_id is not null then c.lc else null end)::numeric(12,2) as labor_cost,
  -- Total unit cost (material + labor); null for custom lines.
  (case
    when el.fixture_id is not null then c.mc + c.lc
    when el.material_id is not null then c.mc
    else null
  end)::numeric(12,2) as unit_cost,
  -- Effective markups applied (fixtures only) and the raw per-line
  -- overrides (null => inheriting the estimate default).
  case when el.fixture_id is not null then c.mmk else null end as material_markup_pct,
  case when el.fixture_id is not null then c.lmk else null end as labor_markup_pct,
  el.material_markup_pct as material_markup_override,
  el.labor_markup_pct as labor_markup_override,
  (el.quantity * p.unit_price)::numeric(14,2) as line_total,
  el.position,
  el.created_at,
  el.updated_at
from erp.estimate_lines el
join erp.estimates est on est.id = el.estimate_id
left join erp.assemblies asm on asm.id = el.fixture_id
left join erp.materials m on m.id = el.material_id
-- Roll the fixture's costs up once, then price off them.
left join lateral (
  select
    erp.assembly_unit_cost(el.fixture_id) as material_cost,
    erp.assembly_labor_cost(el.fixture_id) as labor_cost
) fx on el.fixture_id is not null
cross join lateral (
  select
    coalesce(fx.material_cost, m.default_unit_cost, 0) as mc,
    coalesce(fx.labor_cost, 0) as lc,
    coalesce(el.material_markup_pct, est.material_markup_pct, 0) as mmk,
    coalesce(el.labor_markup_pct, est.labor_markup_pct, 0) as lmk
) c
cross join lateral (
  select (case
    when el.fixture_id is not null
      then round(c.mc * (1 + c.mmk / 100) + c.lc * (1 + c.lmk / 100), 2)
    when el.material_id is not null
      then coalesce(el.unit_price, m.default_unit_cost, 0)
    else coalesce(el.unit_price, 0)
  end)::numeric(12,2) as unit_price
) p;

grant select on erp.estimate_line_details to authenticated, service_role;

create view erp.estimate_totals
with (security_invoker = true) as
select
  e.id as estimate_id,
  (e.locked_snapshot_id is not null) as is_locked,
  case
    when e.locked_snapshot_id is not null
      then coalesce((select s.total from erp.estimate_snapshots s where s.id = e.locked_snapshot_id), 0)
    else coalesce((select sum(d.line_total) from erp.estimate_line_details d where d.estimate_id = e.id), 0)
  end::numeric(14,2) as total
from erp.estimates e;

grant select on erp.estimate_totals to authenticated, service_role;

-- ─── Snapshots carry both components + both markups ────────────
alter table erp.estimate_snapshots
  add column if not exists material_markup_pct numeric(6,3) not null default 0;
alter table erp.estimate_snapshots
  add column if not exists labor_markup_pct numeric(6,3) not null default 0;

alter table erp.estimate_snapshot_lines
  add column if not exists material_cost numeric(12,2);
alter table erp.estimate_snapshot_lines
  add column if not exists labor_cost numeric(12,2);
alter table erp.estimate_snapshot_lines
  add column if not exists material_markup_pct numeric(6,3);
alter table erp.estimate_snapshot_lines
  add column if not exists labor_markup_pct numeric(6,3);

-- Existing snapshots are a frozen record of pricing that had NO labor in
-- it: their whole cost was material, marked up at the single old rate.
-- Backfilling labor as 0 keeps every historical total exactly as locked.
-- Guarded so re-running this file is a no-op rather than an error.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'erp' and table_name = 'estimate_snapshots' and column_name = 'markup_pct'
  ) then
    update erp.estimate_snapshots
    set material_markup_pct = markup_pct,
        labor_markup_pct    = 0
    where markup_pct is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'erp' and table_name = 'estimate_snapshot_lines' and column_name = 'markup_pct'
  ) then
    update erp.estimate_snapshot_lines
    set material_cost       = unit_cost,
        labor_cost          = 0,
        material_markup_pct = markup_pct,
        labor_markup_pct    = 0;
  end if;
end $$;

alter table erp.estimate_snapshots      drop column if exists markup_pct;
alter table erp.estimate_snapshot_lines drop column if exists markup_pct;

-- Freeze both cost components and both markups into the snapshot.
create or replace function erp.lock_estimate(p_estimate_id uuid, p_label text)
returns uuid
language plpgsql
security invoker
as $$
declare
  snap_id uuid;
  snap_total numeric;
  est_mat_markup numeric;
  est_lab_markup numeric;
begin
  select material_markup_pct, labor_markup_pct
  into est_mat_markup, est_lab_markup
  from erp.estimates where id = p_estimate_id;

  insert into erp.estimate_snapshots
    (estimate_id, label, material_markup_pct, labor_markup_pct, created_by)
  values
    (p_estimate_id, coalesce(p_label, ''), coalesce(est_mat_markup, 0), coalesce(est_lab_markup, 0), auth.uid())
  returning id into snap_id;

  insert into erp.estimate_snapshot_lines
    (snapshot_id, kind, description, sku, quantity, unit_cost, material_cost, labor_cost,
     material_markup_pct, labor_markup_pct, unit_price, line_total, position)
  select
    snap_id, d.kind, d.description, d.sku, d.quantity, d.unit_cost, d.material_cost, d.labor_cost,
    d.material_markup_pct, d.labor_markup_pct, d.unit_price, d.line_total, d.position
  from erp.estimate_line_details d
  where d.estimate_id = p_estimate_id;

  select coalesce(sum(line_total), 0) into snap_total
  from erp.estimate_snapshot_lines where snapshot_id = snap_id;

  update erp.estimate_snapshots set total = snap_total where id = snap_id;
  update erp.estimates set locked_snapshot_id = snap_id where id = p_estimate_id;

  return snap_id;
end;
$$;

grant execute on function erp.lock_estimate(uuid, text) to authenticated, service_role;
