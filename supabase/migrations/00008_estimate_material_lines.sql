-- ════════════════════════════════════════════════════════════════
-- ERP — estimate lines from materials (live price) + custom (non-stock)
--
-- Estimate lines can now be pulled from erp.materials. A material-linked
-- line stores material_id and leaves unit_price NULL so it always takes
-- the material's CURRENT price (erp.materials.default_unit_cost) — i.e.
-- if the material is repriced, open estimates reflect the new price. A
-- custom line (material_id NULL) stores its own unit_price and is flagged
-- non-stock in the UI (a part we don't normally carry).
--
-- Because a material line's price is live, the previously-generated
-- line_total (fixed at insert) can't represent it — totals are computed
-- in the erp.estimate_line_details view below instead.
--
-- Run after 00007.
-- ════════════════════════════════════════════════════════════════

alter table erp.estimate_lines
  add column if not exists material_id uuid references erp.materials(id);

create index if not exists estimate_lines_material_idx
  on erp.estimate_lines(material_id) where material_id is not null;

-- Material lines keep unit_price NULL (price derived live); custom lines
-- store their own. So unit_price is now nullable and the stored generated
-- total is dropped in favour of the view.
alter table erp.estimate_lines alter column unit_price drop not null;
alter table erp.estimate_lines drop column if exists line_total;

-- Effective, live-priced view of estimate lines for display and totals.
-- security_invoker so the caller's RLS on estimate_lines + materials
-- applies (estimate managers — admin/pm — can also read materials).
create or replace view erp.estimate_line_details
with (security_invoker = true) as
select
  el.id,
  el.estimate_id,
  el.material_id,
  (el.material_id is null)                                        as is_custom,
  coalesce(nullif(el.description, ''), m.name, '')                as description,
  m.sku,
  el.quantity,
  coalesce(el.unit_price, m.default_unit_cost, 0)::numeric(12,2)  as unit_price,
  el.unit_cost,
  (el.quantity * coalesce(el.unit_price, m.default_unit_cost, 0))::numeric(14,2) as line_total,
  el.position,
  el.created_at,
  el.updated_at
from erp.estimate_lines el
left join erp.materials m on m.id = el.material_id;

grant select on erp.estimate_line_details to authenticated, service_role;
