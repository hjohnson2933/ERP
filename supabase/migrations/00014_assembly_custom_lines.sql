-- ════════════════════════════════════════════════════════════════
-- ERP — custom (non-stock) BOM lines on assemblies.
--
-- A BOM line can now be a custom, non-stock item: no material and no
-- child assembly, just a typed description and cost. Works for both
-- plain assemblies and fixtures.
--
-- The custom line's cost is stored in the existing unit_cost_override
-- column (a custom line has no "standard" cost, so its override IS its
-- cost). The roll-up already reads coalesce(unit_cost_override, <material
-- / child / else 0>), and a custom line hits the "else 0" branch — so the
-- override wins and NO change to erp.assembly_unit_cost() is needed.
--
-- Run after 00013.
-- ════════════════════════════════════════════════════════════════

alter table erp.assembly_components
  add column if not exists description text;

-- Allow a third kind of line: custom (both refs null, description set).
alter table erp.assembly_components drop constraint if exists assembly_components_one_target_ck;
alter table erp.assembly_components
  add constraint assembly_components_one_target_ck check (
    (material_id is not null and child_assembly_id is null) or
    (material_id is null and child_assembly_id is not null) or
    (material_id is null and child_assembly_id is null and length(coalesce(description, '')) > 0)
  );
