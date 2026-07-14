-- ════════════════════════════════════════════════════════════════
-- ERP — estimation module Stage 4: fixtures on estimates + markup.
--
-- Estimates become collections of fixtures sold at a markup (decision
-- 2C: one estimate-wide markup %, overridable per line), plus custom
-- (non-stock) lines. A fixture line carries no stored price — its sell
-- price is computed live: rolled-up material cost × (1 + markup).
-- Custom lines keep a typed sell price. Legacy material lines (Stage
-- pre-4) still resolve for display.
--
-- Run after 00009.
-- ════════════════════════════════════════════════════════════════

-- Estimate-wide default markup (percent, e.g. 35.000 = 35%).
alter table erp.estimates
  add column if not exists markup_pct numeric(6,3) not null default 0;

-- Fixture reference + optional per-line markup override.
alter table erp.estimate_lines
  add column if not exists fixture_id uuid references erp.assemblies(id);
alter table erp.estimate_lines
  add column if not exists markup_pct numeric(6,3);

create index if not exists estimate_lines_fixture_idx
  on erp.estimate_lines(fixture_id) where fixture_id is not null;

-- A line references at most one source (fixture or legacy material).
alter table erp.estimate_lines drop constraint if exists estimate_lines_one_source_ck;
alter table erp.estimate_lines
  add constraint estimate_lines_one_source_ck
  check (not (fixture_id is not null and material_id is not null));

-- Rebuild the details view to price fixtures (cost × markup), keep custom
-- lines (typed price) and legacy material lines (live material cost).
-- Dropped + recreated because the column set/order changes.
drop view if exists erp.estimate_line_details;

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
  -- effective unit SELL price
  (case
    when el.fixture_id is not null
      then round(erp.assembly_unit_cost(el.fixture_id) * (1 + coalesce(el.markup_pct, est.markup_pct, 0) / 100), 2)
    when el.material_id is not null
      then coalesce(el.unit_price, m.default_unit_cost, 0)
    else coalesce(el.unit_price, 0)
  end)::numeric(12,2) as unit_price,
  -- underlying unit COST (for margin/reference); null for custom lines
  (case
    when el.fixture_id is not null then erp.assembly_unit_cost(el.fixture_id)
    when el.material_id is not null then coalesce(m.default_unit_cost, 0)
    else null
  end)::numeric(12,2) as unit_cost,
  -- effective markup applied (fixtures only) and the raw per-line override
  case when el.fixture_id is not null then coalesce(el.markup_pct, est.markup_pct) else null end as markup_pct,
  el.markup_pct as markup_override,
  (el.quantity * (case
    when el.fixture_id is not null
      then round(erp.assembly_unit_cost(el.fixture_id) * (1 + coalesce(el.markup_pct, est.markup_pct, 0) / 100), 2)
    when el.material_id is not null
      then coalesce(el.unit_price, m.default_unit_cost, 0)
    else coalesce(el.unit_price, 0)
  end))::numeric(14,2) as line_total,
  el.position,
  el.created_at,
  el.updated_at
from erp.estimate_lines el
join erp.estimates est on est.id = el.estimate_id
left join erp.assemblies asm on asm.id = el.fixture_id
left join erp.materials m on m.id = el.material_id;

grant select on erp.estimate_line_details to authenticated, service_role;
