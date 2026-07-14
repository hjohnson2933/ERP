-- ════════════════════════════════════════════════════════════════
-- ERP — estimation module expansion, Stage 1: programs, assemblies,
-- bill of materials, and recursive material-cost roll-up.
--
-- Model:
--   part          = a material (erp.materials) — the simplest unit.
--   assembly      = a named build from a BOM of parts and/or other
--                   assemblies (sub-assemblies), each with a quantity.
--   fixture       = a finished assembly (is_fixture) assigned to exactly
--                   one program (decision 4A).
--   program       = a brand's set of currently-active fixtures.
--
-- Cost rolls up recursively from material costs; a per-estimate markup
-- (added in a later stage) turns cost into sell price. Circular BOMs are
-- rejected by a trigger so the roll-up recursion always terminates.
--
-- This stage adds NO estimate changes and NO UI. Kept as new tables
-- alongside the existing order_forms/order_form_items (decision 1B).
--
-- Run after 00008.
-- ════════════════════════════════════════════════════════════════

-- Who can manage the product catalog (programs, assemblies, fixtures).
-- Mirrors canManageCatalog() in src/lib/auth/roles.ts — keep in sync.
create or replace function erp.can_manage_catalog()
returns boolean
language sql stable
as $$
  select public.my_role() in ('admin', 'pm');
$$;

grant execute on function erp.can_manage_catalog() to authenticated, service_role;

-- ─── Programs ──────────────────────────────────────────────────
create table erp.programs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references erp.brands(id),
  name text not null,
  active boolean not null default true,
  notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index programs_brand_idx on erp.programs(brand_id);

create trigger programs_set_updated_at
  before update on erp.programs
  for each row execute function public.set_updated_at();

-- ─── Assemblies (sub-assemblies + fixtures) ────────────────────
-- is_fixture => finished, sellable, belongs to exactly one program.
-- Non-fixtures (plain/sub-assemblies) are reusable and have no program.
create table erp.assemblies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  assembly_number text,                  -- optional human number
  is_fixture boolean not null default false,
  program_id uuid references erp.programs(id),
  description text not null default '',
  photo_path text not null default '',   -- Supabase Storage path
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assemblies_fixture_program_ck check (
    (is_fixture and program_id is not null) or (not is_fixture and program_id is null)
  )
);

create index assemblies_program_idx on erp.assemblies(program_id) where program_id is not null;
create index assemblies_fixture_idx on erp.assemblies(is_fixture) where is_fixture;

create trigger assemblies_set_updated_at
  before update on erp.assemblies
  for each row execute function public.set_updated_at();

-- ─── Bill of Materials ─────────────────────────────────────────
-- Each row is one component of parent_assembly_id: either a material
-- (part) OR a child assembly (sub-assembly), in a quantity. Exactly one
-- target is set. category for BOM grouping comes from the material.
create table erp.assembly_components (
  id uuid primary key default gen_random_uuid(),
  parent_assembly_id uuid not null references erp.assemblies(id) on delete cascade,
  material_id uuid references erp.materials(id),
  child_assembly_id uuid references erp.assemblies(id),
  quantity numeric(12,3) not null check (quantity > 0),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assembly_components_one_target_ck check (
    (material_id is not null and child_assembly_id is null) or
    (material_id is null and child_assembly_id is not null)
  ),
  constraint assembly_components_no_self_ck check (
    child_assembly_id is null or child_assembly_id <> parent_assembly_id
  )
);

create index assembly_components_parent_idx on erp.assembly_components(parent_assembly_id);
create index assembly_components_child_idx on erp.assembly_components(child_assembly_id) where child_assembly_id is not null;
create index assembly_components_material_idx on erp.assembly_components(material_id) where material_id is not null;

create trigger assembly_components_set_updated_at
  before update on erp.assembly_components
  for each row execute function public.set_updated_at();

-- ─── Cycle protection ──────────────────────────────────────────
-- Reject adding a sub-assembly that would make a BOM contain itself
-- (directly or transitively), so the cost roll-up always terminates.
create or replace function erp.check_assembly_cycle()
returns trigger
language plpgsql
as $$
begin
  if new.child_assembly_id is null then
    return new;
  end if;
  if exists (
    with recursive descendants as (
      select new.child_assembly_id as id
      union
      select ac.child_assembly_id
      from erp.assembly_components ac
      join descendants d on ac.parent_assembly_id = d.id
      where ac.child_assembly_id is not null
    )
    select 1 from descendants where id = new.parent_assembly_id
  ) then
    raise exception 'Adding this sub-assembly would create a circular bill of materials';
  end if;
  return new;
end;
$$;

create trigger assembly_components_cycle_check
  before insert or update on erp.assembly_components
  for each row execute function erp.check_assembly_cycle();

-- ─── Recursive material-cost roll-up ───────────────────────────
-- Unit material cost of an assembly = sum over its components of
-- quantity × (material cost, or the child assembly's rolled-up cost).
-- Safe from infinite recursion because cycles are rejected above.
create or replace function erp.assembly_unit_cost(a_id uuid)
returns numeric
language plpgsql stable
as $$
declare
  total numeric := 0;
begin
  select coalesce(sum(
    ac.quantity * case
      when ac.material_id is not null then coalesce(m.default_unit_cost, 0)
      when ac.child_assembly_id is not null then erp.assembly_unit_cost(ac.child_assembly_id)
      else 0
    end
  ), 0)
  into total
  from erp.assembly_components ac
  left join erp.materials m on m.id = ac.material_id
  where ac.parent_assembly_id = a_id;
  return total;
end;
$$;

grant execute on function erp.assembly_unit_cost(uuid) to authenticated, service_role;

-- Convenience view: every assembly with its current rolled-up unit cost.
create or replace view erp.assembly_costs
with (security_invoker = true) as
select
  a.id as assembly_id,
  a.name,
  a.assembly_number,
  a.is_fixture,
  a.program_id,
  a.active,
  erp.assembly_unit_cost(a.id)::numeric(14,2) as unit_cost
from erp.assemblies a
where a.deleted_at is null;

grant select on erp.assembly_costs to authenticated, service_role;

-- ─── RLS ───────────────────────────────────────────────────────
alter table erp.programs            enable row level security;
alter table erp.assemblies          enable row level security;
alter table erp.assembly_components enable row level security;

create policy programs_read  on erp.programs for select using (erp.can_manage_catalog());
create policy programs_write on erp.programs for all    using (erp.can_manage_catalog());

create policy assemblies_read  on erp.assemblies for select using (erp.can_manage_catalog());
create policy assemblies_write on erp.assemblies for all    using (erp.can_manage_catalog());

create policy assembly_components_read  on erp.assembly_components for select using (erp.can_manage_catalog());
create policy assembly_components_write on erp.assembly_components for all    using (erp.can_manage_catalog());
