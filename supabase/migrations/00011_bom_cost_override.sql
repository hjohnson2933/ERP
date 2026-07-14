-- ════════════════════════════════════════════════════════════════
-- ERP — BOM per-line cost override.
--
-- A bill-of-materials line can override its unit cost instead of using
-- the material's standard cost (or a sub-assembly's rolled-up cost).
-- NULL = use the standard cost (the default). The roll-up uses the
-- override when present, so fixture and estimate prices follow it.
--
-- Run after 00010.
-- ════════════════════════════════════════════════════════════════

alter table erp.assembly_components
  add column if not exists unit_cost_override numeric(12,2);

alter table erp.assembly_components drop constraint if exists assembly_components_override_nonneg_ck;
alter table erp.assembly_components
  add constraint assembly_components_override_nonneg_ck
  check (unit_cost_override is null or unit_cost_override >= 0);

-- Roll-up now honours the per-line override.
create or replace function erp.assembly_unit_cost(a_id uuid)
returns numeric
language plpgsql stable
as $$
declare
  total numeric := 0;
begin
  select coalesce(sum(
    ac.quantity * coalesce(ac.unit_cost_override, case
      when ac.material_id is not null then coalesce(m.default_unit_cost, 0)
      when ac.child_assembly_id is not null then erp.assembly_unit_cost(ac.child_assembly_id)
      else 0
    end)
  ), 0)
  into total
  from erp.assembly_components ac
  left join erp.materials m on m.id = ac.material_id
  where ac.parent_assembly_id = a_id;
  return total;
end;
$$;
