-- ════════════════════════════════════════════════════════════════
-- ERP — assembly labor: a central rate table + labor lines on an
-- assembly, with a recursive roll-up parallel to the material one.
--
-- Model:
--   labor_types    = the central rate table (category + name + $/hr).
--                    A labor line stores only type + hours; its cost is
--                    ALWAYS hours × the type's current rate, computed
--                    live. Change a rate here and every unlocked
--                    assembly and estimate re-prices. There is no
--                    per-line rate override — this table is the single
--                    source of truth for what labor costs.
--   assembly_labor = one labor line on an assembly (type + hours).
--
-- Labor rolls up through sub-assemblies exactly like material cost: a
-- fixture's labor = its own labor + each sub-assembly's rolled-up labor
-- × that BOM line's quantity.
--
-- Cost is deliberately kept in TWO separate components from here on
-- (material_cost, labor_cost) because the next stage marks each up at a
-- different percentage. To keep this migration safe to deploy on its
-- own, erp.assembly_unit_cost() is left MATERIAL-ONLY and unchanged, so
-- erp.estimate_line_details (00010) keeps pricing fixtures exactly as it
-- does today. Labor reaches estimates in the next stage, on purpose.
--
-- Rates are seeded at 0.00 — see the UPDATE block at the bottom of this
-- file to set them.
--
-- Run after 00015.
-- ════════════════════════════════════════════════════════════════

-- ─── The rate table ────────────────────────────────────────────
create type erp.labor_category as enum ('general', 'fabrication');

create table erp.labor_types (
  id uuid primary key default gen_random_uuid(),
  category erp.labor_category not null,
  name text not null,
  rate numeric(12,2) not null default 0 check (rate >= 0),
  active boolean not null default true,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One rate per named type within a category.
create unique index labor_types_category_name_idx on erp.labor_types(category, name);

create trigger labor_types_set_updated_at
  before update on erp.labor_types
  for each row execute function public.set_updated_at();

-- Seeded with the categories/types from the spec, all at 0.00/hr.
-- Fixed IDs so the seed is idempotent and stable across environments.
insert into erp.labor_types (id, category, name, rate, position) values
  ('c1000000-0000-0000-0000-000000000001', 'general',     'CAD',                 0, 1),
  ('c1000000-0000-0000-0000-000000000002', 'general',     'Programming',         0, 2),
  ('c1000000-0000-0000-0000-000000000003', 'general',     'Project Management',  0, 3),
  ('c1000000-0000-0000-0000-000000000004', 'general',     'Estimation',          0, 4),
  ('c1000000-0000-0000-0000-000000000005', 'fabrication', 'CNC',                 0, 1),
  ('c1000000-0000-0000-0000-000000000006', 'fabrication', 'Edge Banding',        0, 2),
  ('c1000000-0000-0000-0000-000000000007', 'fabrication', 'Carpentry',           0, 3),
  ('c1000000-0000-0000-0000-000000000008', 'fabrication', 'Glass',               0, 4),
  ('c1000000-0000-0000-0000-000000000009', 'fabrication', 'Finishing',           0, 5),
  ('c1000000-0000-0000-0000-00000000000a', 'fabrication', 'Solid Surface',       0, 6),
  ('c1000000-0000-0000-0000-00000000000b', 'fabrication', 'Handling',            0, 7),
  ('c1000000-0000-0000-0000-00000000000c', 'fabrication', 'Layup',               0, 8),
  ('c1000000-0000-0000-0000-00000000000d', 'fabrication', 'Panel Saw',           0, 9)
on conflict (id) do nothing;

-- ─── Labor lines on an assembly ────────────────────────────────
-- Cost is not stored: it is hours × labor_types.rate, always live.
-- Multiple lines of the same type are allowed (e.g. two CNC operations).
create table erp.assembly_labor (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid not null references erp.assemblies(id) on delete cascade,
  labor_type_id uuid not null references erp.labor_types(id),
  hours numeric(12,3) not null check (hours > 0),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assembly_labor_assembly_idx on erp.assembly_labor(assembly_id);
create index assembly_labor_type_idx on erp.assembly_labor(labor_type_id);

create trigger assembly_labor_set_updated_at
  before update on erp.assembly_labor
  for each row execute function public.set_updated_at();

-- ─── Recursive labor roll-up ───────────────────────────────────
-- Labor cost of an assembly = its own labor (hours × rate) + each
-- sub-assembly's rolled-up labor × that BOM line's quantity.
--
-- Note on BOM overrides: a BOM line's unit_cost_override replaces the
-- child's MATERIAL cost only (that is what erp.assembly_unit_cost reads
-- it for). A sub-assembly's labor still rolls up here regardless — so
-- overriding a sub-assembly's material price does not silently discard
-- the labor needed to build it.
--
-- Safe from infinite recursion: assembly_components_cycle_check (00009)
-- rejects circular BOMs.
create or replace function erp.assembly_labor_cost(a_id uuid)
returns numeric
language plpgsql stable
as $$
declare
  own_cost   numeric := 0;
  child_cost numeric := 0;
begin
  select coalesce(sum(al.hours * lt.rate), 0)
  into own_cost
  from erp.assembly_labor al
  join erp.labor_types lt on lt.id = al.labor_type_id
  where al.assembly_id = a_id;

  select coalesce(sum(ac.quantity * erp.assembly_labor_cost(ac.child_assembly_id)), 0)
  into child_cost
  from erp.assembly_components ac
  where ac.parent_assembly_id = a_id
    and ac.child_assembly_id is not null;

  return own_cost + child_cost;
end;
$$;

grant execute on function erp.assembly_labor_cost(uuid) to authenticated, service_role;

-- Same roll-up, in hours. Rates start at 0.00, so until they are set
-- hours are the only meaningful labor figure — the UI shows both.
create or replace function erp.assembly_labor_hours(a_id uuid)
returns numeric
language plpgsql stable
as $$
declare
  own_hours   numeric := 0;
  child_hours numeric := 0;
begin
  select coalesce(sum(al.hours), 0)
  into own_hours
  from erp.assembly_labor al
  where al.assembly_id = a_id;

  select coalesce(sum(ac.quantity * erp.assembly_labor_hours(ac.child_assembly_id)), 0)
  into child_hours
  from erp.assembly_components ac
  where ac.parent_assembly_id = a_id
    and ac.child_assembly_id is not null;

  return own_hours + child_hours;
end;
$$;

grant execute on function erp.assembly_labor_hours(uuid) to authenticated, service_role;

-- ─── assembly_costs: material and labor, separately ────────────
-- unit_cost is kept as a MATERIAL-ONLY alias of material_cost so the
-- existing estimate view (00010) and the assemblies list keep working
-- unchanged. The next stage (split markup) consumes material_cost and
-- labor_cost directly and retires the alias.
create or replace view erp.assembly_costs
with (security_invoker = true) as
select
  a.id as assembly_id,
  a.name,
  a.assembly_number,
  a.is_fixture,
  a.program_id,
  a.active,
  erp.assembly_unit_cost(a.id)::numeric(14,2) as unit_cost,     -- deprecated alias of material_cost
  erp.assembly_unit_cost(a.id)::numeric(14,2) as material_cost,
  erp.assembly_labor_cost(a.id)::numeric(14,2) as labor_cost,
  erp.assembly_labor_hours(a.id)::numeric(14,3) as labor_hours,
  (erp.assembly_unit_cost(a.id) + erp.assembly_labor_cost(a.id))::numeric(14,2) as total_cost
from erp.assemblies a
where a.deleted_at is null;

grant select on erp.assembly_costs to authenticated, service_role;

-- ─── RLS ───────────────────────────────────────────────────────
alter table erp.labor_types    enable row level security;
alter table erp.assembly_labor enable row level security;

-- Reads are also granted to estimate managers: assembly_labor_cost() is a
-- plain (non-definer) function called from security_invoker views, so the
-- caller's RLS applies — the next stage prices labor onto estimates.
create policy labor_types_read on erp.labor_types for select
  using (erp.can_manage_catalog() or erp.can_manage_estimates());
create policy labor_types_write on erp.labor_types for all
  using (erp.can_manage_catalog());

create policy assembly_labor_read on erp.assembly_labor for select
  using (erp.can_manage_catalog() or erp.can_manage_estimates());
create policy assembly_labor_write on erp.assembly_labor for all
  using (erp.can_manage_catalog());

-- ════════════════════════════════════════════════════════════════
-- SETTING THE RATES
--
-- Every type above is seeded at $0.00/hr, so labor costs $0 until you
-- fill these in. Replace the zeros with your shop's hourly rates and run
-- this block in the Supabase SQL Editor. It is safe to re-run at any
-- time — this is also how you change a rate later.
--
--   update erp.labor_types set rate = case name
--     when 'CAD'                then   0.00
--     when 'Programming'        then   0.00
--     when 'Project Management' then   0.00
--     when 'Estimation'         then   0.00
--     when 'CNC'                then   0.00
--     when 'Edge Banding'       then   0.00
--     when 'Carpentry'          then   0.00
--     when 'Glass'              then   0.00
--     when 'Finishing'          then   0.00
--     when 'Solid Surface'      then   0.00
--     when 'Handling'           then   0.00
--     when 'Layup'              then   0.00
--     when 'Panel Saw'          then   0.00
--     else rate
--   end;
--
-- Changing a rate re-prices every assembly and every unlocked estimate
-- that uses it. Estimates whose pricing is locked (00012) keep the
-- snapshot they were locked at and are NOT affected.
-- ════════════════════════════════════════════════════════════════
