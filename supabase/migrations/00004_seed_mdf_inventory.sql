-- ════════════════════════════════════════════════════════════════
-- ERP — MDF inventory seed data (from iPOL export)
-- Populates erp.locations, erp.vendors, erp.materials, and
-- erp.stock_levels with the MDF sheet goods dataset exported
-- from InventoryPro. Run after 00001, 00002, and 00003.
--
-- Notes on the source data:
--   - All items are category WOOD, unit_of_measure 'sheet'
--   - Two active locations: MILL and 115 HAAS WAREHOUSE
--   - Three vendors: PACKARD, HOOD, and FLAGG
--   - WDMDF02335 has committed = -8 in iPOL (over-committed);
--     imported as in_stock only, committed derived later from job_materials
--   - WDMDF02371 is discontinued; active = false, notes preserve replacement SKU
--   - WDMDF02364-A is a duplicate SKU variant; stored with modified name
-- ════════════════════════════════════════════════════════════════

-- ─── Locations ─────────────────────────────────────────────────
insert into erp.locations (id, name, address, active, position) values
  ('a1000000-0000-0000-0000-000000000001', 'MILL',               '', true, 1),
  ('a1000000-0000-0000-0000-000000000002', '115 HAAS WAREHOUSE', '', true, 2)
on conflict (id) do nothing;

-- ─── Vendors ───────────────────────────────────────────────────
insert into erp.vendors (id, name, active) values
  ('b1000000-0000-0000-0000-000000000001', 'PACKARD FOREST PRODUCTS, INC',                                                   true),
  ('b1000000-0000-0000-0000-000000000002', 'HOOD INCORPORATED dba HOOD DISTRIBUTION - MCEWEN & MCQUESTEN GROUPS',            true),
  ('b1000000-0000-0000-0000-000000000003', 'FLAGG INCORPORATED',                                                              true),
  ('b1000000-0000-0000-0000-000000000004', 'RICHELIEU AMERICA LTD',                                                           true)
on conflict (id) do nothing;

-- ─── Materials ───────────────────────────────────────────────
insert into erp.materials
  (sku, name, description, notes, category, unit_of_measure,
   default_location_id, default_vendor_id, active)
values
  ('WDMDF02326', 'MDF - 1/4" x 4'' x 8''', '', '(96 Sheets Per Unit)', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02327', 'MDF 1/4" x 4'' x 10'' - (96 Sheets per Unit)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02328', 'MDF 1/4" x 4'' x 12''', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02329', 'MDF 1/4" x 5'' x 8''', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02331', 'MDF 3/8" x 4'' x 8'' - (80 Sheets per Unit)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02332', 'MDF 3/8" x 4'' x 10'' - (65 SHEETS PER UNIT)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02333', 'MDF 3/8" x 4'' x 12'' - (80 Sheets per Unit)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02335', 'MDF 1/2" x 4'' x 8'' - (50 Sheets per Unit)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02336', 'MDF 1/2" x 4'' x 10''', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02337', 'MDF 1/2" x 4'' x 12''', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02339', 'MDF 5/8" x 4'' x 8'' (40 Sheets Per Unit)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02340', 'MDF - 3/4" x 4'' x 8'' #MDF3448', '', '(32 Sheets Per Unit)', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02341', 'MDF - 3/4" x 4'' x 10" #MDF34410 - (32 Sheets Per Unit)', '', '#MDF34410 - (32 Sheets Per Unit)', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02342', 'MDF - 3/4" x 4'' x 12'' #MDF34412', '', '#MDF34412', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02343', 'MDF CORE 3/4IN. x 5FT. x 12FT. (32 SHEETS PER UNIT) #MDF34512', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02344', 'MDF - 1" x 4'' x 8''', '', '#MDF148 - (24 Sheets Per Unit)', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02345', 'MDF - 1" x 4'' x 10'' #MDF1410 - (24 Sheets Per Unit)', '', '(Lead Time 2-3 Weeks)', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02346', 'MDF 1-1/8" x 4'' x 8'' - (21 Sheets per Unit)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02347', 'MDF - 1-1/8" x 4'' x 10'' #MDF118410', '', '#MDF118410 - (21 Sheets Per Unit)', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02348', 'MDF 1-1/8" x 4'' x 12'' (21 Sheets Per Unit)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02349', 'MDF CORE 1-1/8IN. x 5FT. x 12FT. (20 SHEETS PER UNIT)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02350', 'MDF 1-1/2" x 4'' x 8'' (16 Sheets Per Unit)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02354', 'MDF - 1-1/4" x 4'' x 10''', '', '(20 Sheets Per Unit) Lead Time = 4-5 Weeks', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02358', 'MDF 1/4" x 5'' x 9''', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02360', 'MDF - 1-1/4" x 4'' x 8''', '', '(20 Sheets Per Unit) Lead Time = 2 Weeks', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02362', 'MDF 1/4" x 5'' x 10'' - (96 Sheets per Unit) (Non-Stock Item - 3 Week Lead Time)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02363', 'MDF 3/4" x 4'' x 8'' - Moisture Resistant', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02364', 'MDF 3/4IN. x 5FT.x 8FT. MDF3458', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02364-A', 'MDF 3/4IN. x 5FT.x 8FT. MDF3458 (Alt)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02365', 'MDF CORE 3/8IN. x 5FT. x 12FT. (80 SHEETS PER UNIT)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02367', 'MDF - 1" x 4'' x 8'' - MR11 Moisture Resistant - (23 Sheets Per Unit)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', true),
  ('WDMDF02368', 'MDF - 15/16" x 4'' x 8''', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02369', 'MDF - 15/16" x 5'' x 8'' - MR11 Moisture Resistant - (23 Sheets Per Unit)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02371', 'DISCONTINUED - MDF BLACK 3/4" x 4'' x 8'' (49" x 97")', '', 'DISCONTINUED 6/4/25. Replacement: WDMDF02378 BLACK 3/4IN. MDF 4FT. X 8FT. MR10 EXCEL MDFBL9', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', false),
  ('WDMDF02372', 'BLACK DIAMOND MDF - 9MM x 49 x 97', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02373', 'MDF 3/4" x 4'' x 10'' - Fire Resistant', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02375', 'MDF CORE 1/4IN. X 5FT. X 12FT. (96 SHEETS PER UNIT)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02376', 'MDF CORE 1/2IN. x 5FT. x 12FT. (50 SHEETS PER UNIT)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02377', 'MDF CORE 1IN. x 5FT. x 12FT. (24 SHEETS PER UNIT)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02378', 'BLACK 3/4IN. MDF 4FT. X 8FT. MR10 EXCEL MDFBL9 (40 per unit)', '', '(PMs will order as needed)', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', true),
  ('WDMDF02379', 'MDF - 3/4" x 5'' x 10'' - #MDF34510 - (28 PER UNIT)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02380', 'MDF GLACIER GREEN 3/4" X 4'' X 8'' (49" X 97")', '', '38/unit, 4 wk lead if not in stock', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02381', 'BLACK DIAMOND MDF - 18MM X 48 X 96 PREMIUM MR MDF LAID UP 2-SIDED W/ SPHERA JET BLACK 3D - 6632HPL', '', 'LAID UP 2-SIDED W/ SPHERA JET BLACK 3D', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', true),
  ('WDMDF02382', '3/4" X 4 X 8 MDF PN 80 OPTI GRAY G2S WITH SATIN FINISH', '', 'SPECIAL ORDER: SHIPS LTL FROM CANADA', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', true),
  ('WDMDF02383', 'MDF - 3/4" X 4'' X 8'' FIRE RATED - (32 SHEETS PER UNIT)', '', '', 'WOOD', 'sheet',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', true)
on conflict (sku) do nothing;

-- ─── Opening stock movements (receipt type, as of iPOL export) ─
-- Creates the initial stock levels via the apply_stock_movement trigger.
-- On Order is NOT imported here — it belongs in erp.purchase_orders (future).
insert into erp.stock_movements
  (material_id, location_id, movement_type, quantity, note)
select
  m.id,
  m.default_location_id,
  'receipt',
  sub.qty,
  'Opening stock from iPOL export'
from (values
  ('WDMDF02326', 89),
  ('WDMDF02327', 96),
  ('WDMDF02328', 96),
  ('WDMDF02331', 32),
  ('WDMDF02332', 198),
  ('WDMDF02333', 16),
  ('WDMDF02335', 44),
  ('WDMDF02336', 41),
  ('WDMDF02337', 21),
  ('WDMDF02339', 28),
  ('WDMDF02340', 44),
  ('WDMDF02341', 30),
  ('WDMDF02342', 50),
  ('WDMDF02343', 54),
  ('WDMDF02344', 32),
  ('WDMDF02345', 41),
  ('WDMDF02346', 45),
  ('WDMDF02347', 4),
  ('WDMDF02349', 40),
  ('WDMDF02350', 49),
  ('WDMDF02369', 5),
  ('WDMDF02371', 13),
  ('WDMDF02372', 129),
  ('WDMDF02378', 103),
  ('WDMDF02379', 41),
  ('WDMDF02382', 23),
  ('WDMDF02383', 3)
) as sub(sku, qty)
join erp.materials m on m.sku = sub.sku
where not exists (
  select 1 from erp.stock_levels sl
  where sl.material_id = m.id and sl.location_id = m.default_location_id
);
