-- ════════════════════════════════════════════════════════════════
-- ERP — material dimensions (for wood) + expose them for search/sort.
--
-- Adds thickness / width / length to erp.materials (used mainly by the
-- "wood" category; null elsewhere) and rebuilds material_stock_summary to
-- expose them, plus active, so the Materials list can search and sort on
-- every attribute.
--
-- Run after 00014.
-- ════════════════════════════════════════════════════════════════

alter table erp.materials add column if not exists thickness numeric(10,4);
alter table erp.materials add column if not exists width numeric(10,4);
alter table erp.materials add column if not exists length numeric(10,4);

-- Rebuild the summary view to add active + dimensions (dropped/recreated
-- because the column set changes).
drop view if exists erp.material_stock_summary;

create view erp.material_stock_summary
with (security_invoker = true) as
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
  m.active,
  m.thickness,
  m.width,
  m.length,
  coalesce(sum(sl.quantity), 0) as in_stock,
  0::numeric                    as on_hold,
  0::numeric                    as committed,
  0::numeric                    as on_order,
  coalesce(sum(sl.quantity), 0) as available
from erp.materials m
left join erp.stock_levels sl on sl.material_id = m.id
where m.deleted_at is null
group by m.id;

grant select on erp.material_stock_summary to authenticated;
