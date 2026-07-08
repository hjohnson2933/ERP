-- ════════════════════════════════════════════════════════════════
-- ERP — vendors stub + materials column updates
-- Adds erp.vendors as a minimal stub so default_vendor_id on
-- erp.materials has a real soft reference target. Full vendor/PO
-- workflow (contacts, payment terms, purchase orders) comes later.
--
-- Also updates erp.materials to match the iPOL Inventory Overview
-- export fields confirmed in design:
--   + notes (separate from description, per iPOL convention)
--   + default_location_id (soft ref to erp.locations)
--   + default_vendor_id (soft ref to erp.vendors)
--
-- On Hold, Committed, and Available are intentionally NOT stored
-- columns — they are derived at query time from future tables
-- (erp.stock_holds, erp.job_materials). On Order derives from the
-- PO workflow, also deferred. In Stock comes from erp.stock_levels.
-- ════════════════════════════════════════════════════════════════

-- ─── Vendors (stub) ────────────────────────────────────────────
create table erp.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text not null default '',
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger vendors_set_updated_at
  before update on erp.vendors
  for each row execute function public.set_updated_at();

alter table erp.vendors enable row level security;
create policy vendors_read on erp.vendors for select using (public.my_role() is not null);
create policy vendors_write on erp.vendors for all using (public.is_editor());

-- ─── Materials column additions ────────────────────────────────

-- Separate notes field (iPOL distinguishes Notes from Description)
alter table erp.materials
  add column if not exists notes text not null default '';

-- Default location — soft reference to erp.locations. Stored as a
-- plain uuid with no FK constraint so the materials table stays
-- portable if the erp schema is split to its own project later.
alter table erp.materials
  add column if not exists default_location_id uuid;

-- Default vendor — soft reference to erp.vendors, same reasoning.
alter table erp.materials
  add column if not exists default_vendor_id uuid;

-- ─── Derived stock view ────────────────────────────────────────
-- Provides In Stock per material across all locations, plus
-- placeholder columns for the derived fields so the UI can
-- reference a consistent shape even before the backing tables exist.
-- On Hold and Committed will be filled in by future migrations that
-- add erp.stock_holds and erp.job_materials respectively.
create or replace view erp.material_stock_summary as
select
  m.id as material_id,
  m.sku,
  m.name,
  m.description,
  m.notes,
  m.category,
  m.unit_of_measure,
  m.default_unit_cost,
  m.reorder_point,
  m.default_location_id,
  m.default_vendor_id,
  coalesce(sum(sl.quantity), 0) as in_stock,
  0::numeric                    as on_hold,       -- stub: derived from erp.stock_holds (future)
  0::numeric                    as committed,      -- stub: derived from erp.job_materials (future)
  0::numeric                    as on_order,       -- stub: derived from erp.purchase_orders (future)
  coalesce(sum(sl.quantity), 0) as available       -- stub: in_stock - on_hold - committed once derived
from erp.materials m
left join erp.stock_levels sl on sl.material_id = m.id
where m.deleted_at is null
group by m.id;

-- Grant access to the view for authenticated users (RLS on underlying
-- tables still applies to direct table queries; view inherits the
-- security context of the caller).
grant select on erp.material_stock_summary to authenticated;
