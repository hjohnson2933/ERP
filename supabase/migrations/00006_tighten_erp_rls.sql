-- ════════════════════════════════════════════════════════════════
-- ERP — RLS audit / tightening
--
-- Audited every erp.* policy created in 00002–00005 against the app's
-- role guards in src/lib/auth/roles.ts (ERP_ROLE_TABS, canManageOrders,
-- canViewStockReservations) and fixed five issues:
--
--   1. erp.stock_levels had no write policy, so the apply_stock_movement()
--      trigger's upsert failed for any non-service-role caller (inventory
--      tracking was broken for real users). Fixed by making the trigger
--      SECURITY DEFINER with a locked search_path — callers only ever
--      write erp.stock_movements, never erp.stock_levels directly.
--
--   2. Every read policy was `public.my_role() is not null`, so any
--      authenticated user of EITHER app could read everything, including
--      pricing and customer data. Tightened to role-scoped reads.
--
--   3. Pricing/catalog writes used public.is_editor() (6 roles),
--      inconsistent with their sibling tables. Aligned to the guard that
--      actually governs each table.
--
--   4. erp.material_stock_summary was a plain view (runs as owner →
--      bypasses RLS on the underlying tables). Set security_invoker.
--
--   5. erp.order_number_seq was never granted, so `insert into erp.orders`
--      failed on the sequence default for real users. Granted.
--
-- NOTE: the SQL Editor runs as a superuser/service connection and bypasses
-- RLS + sequence grants, so these fixes must be verified from the app
-- logged in as specific roles — see ERP_SESSION_HANDOFF.md "Verification
-- gaps".
--
-- Run after 00001–00005.
-- ════════════════════════════════════════════════════════════════

-- ─── Role guard: who may view materials / inventory ────────────
-- Mirrors canViewStockReservations() in src/lib/auth/roles.ts.
-- Keep the two in sync.
create or replace function erp.can_view_materials()
returns boolean
language sql stable
as $$
  select public.my_role() in ('admin', 'pm', 'foreman', 'cnc_manager');
$$;

-- ─── (1) stock_levels write path ───────────────────────────────
-- Users never write erp.stock_levels directly; the trigger keeps it in
-- sync from erp.stock_movements. Make the trigger SECURITY DEFINER so it
-- can maintain stock_levels regardless of the caller's RLS, and pin the
-- search_path so it always resolves erp.stock_levels (never a caller's
-- shadowing object).
create or replace function erp.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = erp, public
as $$
declare
  delta numeric;
begin
  delta := case new.movement_type
    when 'receipt'      then  new.quantity
    when 'transfer_in'  then  new.quantity
    when 'issue'        then -new.quantity
    when 'transfer_out' then -new.quantity
    when 'adjustment'   then  new.quantity
  end;

  insert into erp.stock_levels (material_id, location_id, quantity, updated_at)
  values (new.material_id, new.location_id, delta, now())
  on conflict (material_id, location_id)
  do update set
    quantity   = erp.stock_levels.quantity + excluded.quantity,
    updated_at = now();

  return new;
end;
$$;

-- ─── (2)+(3) Reads and writes re-scoped by role ────────────────
-- Inventory / materials domain → erp.can_view_materials()
--   (admin, pm, foreman, cnc_manager)

drop policy if exists locations_read  on erp.locations;
create policy locations_read on erp.locations
  for select using (erp.can_view_materials());
-- locations_write stays is_admin() (from 00002) — unchanged.

drop policy if exists materials_read  on erp.materials;
drop policy if exists materials_write on erp.materials;
create policy materials_read on erp.materials
  for select using (erp.can_view_materials());
create policy materials_write on erp.materials
  for all using (erp.can_view_materials());

drop policy if exists stock_levels_read on erp.stock_levels;
create policy stock_levels_read on erp.stock_levels
  for select using (erp.can_view_materials());

drop policy if exists stock_movements_read   on erp.stock_movements;
drop policy if exists stock_movements_insert on erp.stock_movements;
create policy stock_movements_read on erp.stock_movements
  for select using (erp.can_view_materials());
create policy stock_movements_insert on erp.stock_movements
  for insert with check (erp.can_view_materials());

drop policy if exists vendors_read  on erp.vendors;
drop policy if exists vendors_write on erp.vendors;
create policy vendors_read on erp.vendors
  for select using (erp.can_view_materials());
create policy vendors_write on erp.vendors
  for all using (erp.can_view_materials());

-- Sales / orders domain → erp.can_manage_orders() (admin, pm)

drop policy if exists brands_read  on erp.brands;
drop policy if exists brands_write on erp.brands;
create policy brands_read on erp.brands
  for select using (erp.can_manage_orders());
create policy brands_write on erp.brands
  for all using (erp.can_manage_orders());

drop policy if exists customers_read on erp.customers;
create policy customers_read on erp.customers
  for select using (erp.can_manage_orders());
-- customers_write already erp.can_manage_orders() (00005) — unchanged.

drop policy if exists order_forms_read  on erp.order_forms;
drop policy if exists order_forms_write on erp.order_forms;
create policy order_forms_read on erp.order_forms
  for select using (erp.can_manage_orders());
create policy order_forms_write on erp.order_forms
  for all using (erp.can_manage_orders());

drop policy if exists order_form_items_read  on erp.order_form_items;
drop policy if exists order_form_items_write on erp.order_form_items;
create policy order_form_items_read on erp.order_form_items
  for select using (erp.can_manage_orders());
create policy order_form_items_write on erp.order_form_items
  for all using (erp.can_manage_orders());

drop policy if exists orders_read on erp.orders;
create policy orders_read on erp.orders
  for select using (erp.can_manage_orders());
-- orders_write already erp.can_manage_orders() (00005) — unchanged.

drop policy if exists order_lines_read on erp.order_lines;
create policy order_lines_read on erp.order_lines
  for select using (erp.can_manage_orders());
-- order_lines_write already erp.can_manage_orders() (00005) — unchanged.

-- ─── (4) View must run with caller's RLS, not owner's ──────────
alter view erp.material_stock_summary set (security_invoker = true);

-- ─── (5) Sequence grant so real users can insert orders ────────
-- erp.orders.order_number defaults to erp.next_order_number(), which
-- calls nextval('erp.order_number_seq'). Without usage on the sequence,
-- inserts fail for authenticated callers.
grant usage, select on sequence erp.order_number_seq to authenticated, service_role;
