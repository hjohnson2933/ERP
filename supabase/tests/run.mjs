// npm run test:migrations
//
// 1. Applies every migration in order against a real Postgres.
// 2. Asserts the costing and pricing rules the SQL is responsible for.
//
// Run this after writing or editing any migration, BEFORE handing the
// file over to be run in the Supabase SQL Editor.

import { freshDb, createChecks, migrationFiles } from "./harness.mjs";

console.log(`Applying ${migrationFiles().length} migrations to a real Postgres (pglite)…\n`);

let db;
try {
  db = await freshDb({ log: true });
} catch (e) {
  console.log(`\n=== MIGRATION CHAIN FAILED ===\n${e.message}`);
  process.exit(1);
}

console.log("\nChain applied cleanly. Checking costing + pricing rules…\n");

const { check, checkRaw, report } = createChecks();
const q = async (sql) => (await db.query(sql)).rows;

// ─── Fixtures for the scenario ─────────────────────────────────
// Rates seed at 0.00 (00016); set the ones under test. 'Finishing' is
// deliberately left at 0.00 to prove unrated labor costs nothing but
// still records hours.
await db.exec(`
  update erp.labor_types set rate = 75  where name = 'CAD';
  update erp.labor_types set rate = 110 where name = 'CNC';
  update erp.labor_types set rate = 60  where name = 'Carpentry';
`);

await db.exec(`
  insert into erp.brands (id, brand_code, name) values
    ('11111111-0000-0000-0000-000000000001','BR1','Test Brand');
  insert into erp.programs (id, brand_id, name) values
    ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Test Program');

  insert into erp.materials (id, sku, name, unit_of_measure, category, default_unit_cost) values
    ('33333333-0000-0000-0000-000000000001','MDF001','MDF Sheet','sheet','Wood',62.40),
    ('33333333-0000-0000-0000-000000000002','EDG001','Edge Banding','roll','Hardware',38.00),
    ('33333333-0000-0000-0000-000000000003','SUB001','Sub Material','ea','Wood',120.75);

  -- Sub-assembly: material 120.75, labor 3.5hr Carpentry @60 = 210.00
  insert into erp.assemblies (id, name, is_fixture) values
    ('44444444-0000-0000-0000-000000000002','Base Cabinet Sub',false);
  insert into erp.assembly_components (parent_assembly_id, material_id, quantity) values
    ('44444444-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000003',1);
  insert into erp.assembly_labor (assembly_id, labor_type_id, hours)
    select '44444444-0000-0000-0000-000000000002', id, 3.5 from erp.labor_types where name='Carpentry';

  -- Fixture: 3x MDF, 2x edge banding overridden to 41.50, 2x the
  -- sub-assembly, 1 custom line at 85.00. Labor: 4h CAD, 6.5h CNC,
  -- 3h Finishing (unrated).
  insert into erp.assemblies (id, name, is_fixture, program_id) values
    ('44444444-0000-0000-0000-000000000001','Counter Display Unit',true,'22222222-0000-0000-0000-000000000001');
  insert into erp.assembly_components
    (parent_assembly_id, material_id, child_assembly_id, description, quantity, unit_cost_override) values
    ('44444444-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000001',null,null,3,null),
    ('44444444-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000002',null,null,2,41.50),
    ('44444444-0000-0000-0000-000000000001',null,'44444444-0000-0000-0000-000000000002',null,2,null),
    ('44444444-0000-0000-0000-000000000001',null,null,'Custom brass plate',1,85.00);
  insert into erp.assembly_labor (assembly_id, labor_type_id, hours)
    select '44444444-0000-0000-0000-000000000001', id, 4   from erp.labor_types where name='CAD';
  insert into erp.assembly_labor (assembly_id, labor_type_id, hours)
    select '44444444-0000-0000-0000-000000000001', id, 6.5 from erp.labor_types where name='CNC';
  insert into erp.assembly_labor (assembly_id, labor_type_id, hours)
    select '44444444-0000-0000-0000-000000000001', id, 3   from erp.labor_types where name='Finishing';
`);

// ─── The roll-up (00016) ───────────────────────────────────────
const [fx] = await q(`
  select material_cost, labor_cost, labor_hours, total_cost, unit_cost
  from erp.assembly_costs where assembly_id='44444444-0000-0000-0000-000000000001'
`);

// 3*62.40=187.20 + 2*41.50=83.00 + 2*120.75=241.50 + 85.00
check("fixture material_cost rolls up (incl. override + custom line)", fx.material_cost, 596.7);
// own 4*75 + 6.5*110 + 3*0 = 1015; sub-assembly 2*210 = 420
check("fixture labor_cost rolls up through the sub-assembly", fx.labor_cost, 1435);
check("fixture labor_hours rolls up", fx.labor_hours, 20.5);
check("fixture total_cost = material + labor", fx.total_cost, 2031.7);
// Stage 3 promise: estimates must not move until split markup lands.
check("assembly_costs.unit_cost is still the material-only alias", fx.unit_cost, 596.7);

// A cost override on a sub-assembly BOM line replaces its material cost
// only — the labor needed to build it still rolls up.
await db.exec(`
  update erp.assembly_components set unit_cost_override = 1.00
  where parent_assembly_id='44444444-0000-0000-0000-000000000001'
    and child_assembly_id='44444444-0000-0000-0000-000000000002'
`);
const [ov] = await q(`
  select material_cost, labor_cost from erp.assembly_costs
  where assembly_id='44444444-0000-0000-0000-000000000001'
`);
// material: 187.20 + 83.00 + 2*1.00 + 85.00 = 357.20
check("override on a sub-assembly line replaces its material cost", ov.material_cost, 357.2);
check("...but its labor still rolls up", ov.labor_cost, 1435);
await db.exec(`
  update erp.assembly_components set unit_cost_override = null
  where parent_assembly_id='44444444-0000-0000-0000-000000000001'
    and child_assembly_id='44444444-0000-0000-0000-000000000002'
`);

// Cycles must stay rejected, or the recursive roll-ups never terminate.
let cycleRejected = false;
try {
  await db.exec(`
    insert into erp.assembly_components (parent_assembly_id, child_assembly_id, quantity)
    values ('44444444-0000-0000-0000-000000000002','44444444-0000-0000-0000-000000000001',1)
  `);
} catch {
  cycleRejected = true;
}
checkRaw("a circular bill of materials is rejected", cycleRejected, true);

// ─── Split markup (00017) ──────────────────────────────────────
await db.exec(`
  insert into erp.estimates (id, title, customer_name, material_markup_pct, labor_markup_pct)
  values ('55555555-0000-0000-0000-000000000001','Test Estimate','Acme',35,60);

  -- Inherits both estimate defaults.
  insert into erp.estimate_lines (estimate_id, fixture_id, description, quantity, position) values
    ('55555555-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001','',2,0);
  -- Overrides both.
  insert into erp.estimate_lines
    (estimate_id, fixture_id, description, quantity, material_markup_pct, labor_markup_pct, position) values
    ('55555555-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000002','',1,10,20,1);
  -- Custom: single typed price, no split.
  insert into erp.estimate_lines (estimate_id, description, quantity, unit_price, position) values
    ('55555555-0000-0000-0000-000000000001','On-site installation',1,1200,2);
`);

const lines = await q(`
  select kind, material_cost, labor_cost, unit_cost, material_markup_pct, labor_markup_pct,
         unit_price, line_total
  from erp.estimate_line_details
  where estimate_id='55555555-0000-0000-0000-000000000001' order by position
`);

const [inherit, over, custom] = lines;

// 596.70*1.35 + 1435*1.60 = 805.545 + 2296 = 3101.545 -> 3101.55
check("inheriting line: each component marked up at its own rate", inherit.unit_price, 3101.55);
check("inheriting line total (qty 2)", inherit.line_total, 6203.1);
check("inheriting line reports the material markup applied", inherit.material_markup_pct, 35);
check("inheriting line reports the labor markup applied", inherit.labor_markup_pct, 60);
check("inheriting line unit_cost = material + labor", inherit.unit_cost, 2031.7);

// 120.75*1.10 + 210*1.20 = 132.825 + 252 = 384.825 -> 384.83
check("overridden line uses its own markups, not the defaults", over.unit_price, 384.83);
check("overridden line reports its material override", over.material_markup_pct, 10);
check("overridden line reports its labor override", over.labor_markup_pct, 20);

check("custom line keeps its typed sell price", custom.unit_price, 1200);
checkRaw(
  "custom line has no cost split to mark up",
  custom.material_cost === null && custom.labor_cost === null,
  true
);

// ─── Price lock (00012 + 00017) ────────────────────────────────
const expectedTotal = 6203.1 + 384.83 + 1200;
await db.exec(`select erp.lock_estimate('55555555-0000-0000-0000-000000000001','Submitted')`);

const [snap] = await q(`
  select material_markup_pct, labor_markup_pct, total from erp.estimate_snapshots
  where estimate_id='55555555-0000-0000-0000-000000000001'
`);
check("snapshot freezes the material markup", snap.material_markup_pct, 35);
check("snapshot freezes the labor markup", snap.labor_markup_pct, 60);
check("snapshot total", snap.total, expectedTotal);

const [snapLine] = await q(`
  select material_cost, labor_cost from erp.estimate_snapshot_lines sl
  join erp.estimate_snapshots s on s.id = sl.snapshot_id
  where s.estimate_id='55555555-0000-0000-0000-000000000001' and sl.position=0
`);
check("snapshot line freezes material_cost", snapLine.material_cost, 596.7);
check("snapshot line freezes labor_cost", snapLine.labor_cost, 1435);

// The whole point of locking: a later rate change must not move it.
await db.exec(`update erp.labor_types set rate = 999 where name = 'CNC'`);
const [tot] = await q(`
  select total, is_locked from erp.estimate_totals
  where estimate_id='55555555-0000-0000-0000-000000000001'
`);
checkRaw("estimate reports as locked", tot.is_locked, true);
check("a locked total ignores a later labor rate change", tot.total, expectedTotal);

// An unlocked estimate, by contrast, must follow the rate live.
await db.exec(`
  insert into erp.estimates (id, title, customer_name, material_markup_pct, labor_markup_pct)
  values ('55555555-0000-0000-0000-000000000002','Live Estimate','Acme',0,0);
  insert into erp.estimate_lines (estimate_id, fixture_id, description, quantity, position) values
    ('55555555-0000-0000-0000-000000000002','44444444-0000-0000-0000-000000000002','',1,0);
`);
const [liveBefore] = await q(
  `select total from erp.estimate_totals where estimate_id='55555555-0000-0000-0000-000000000002'`
);
await db.exec(`update erp.labor_types set rate = 120 where name = 'Carpentry'`);
const [liveAfter] = await q(
  `select total from erp.estimate_totals where estimate_id='55555555-0000-0000-0000-000000000002'`
);
// 120.75 + 3.5*60 = 330.75  ->  120.75 + 3.5*120 = 540.75
check("an unlocked estimate prices labor live (before)", liveBefore.total, 330.75);
check("an unlocked estimate follows a rate change (after)", liveAfter.total, 540.75);

// ─── Report ────────────────────────────────────────────────────
console.log("");
const failed = report();
const total = failed === 0 ? "all" : `${failed} of`;
console.log(
  failed === 0
    ? `\n${total} checks passed.`
    : `\n${total} checks FAILED.`
);
process.exit(failed === 0 ? 0 : 1);
