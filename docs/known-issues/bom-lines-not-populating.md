# BOM / labor lines not populating on the assembly edit page

## Symptom

On an assembly's edit page (`/dashboard/assemblies/[id]/edit`), a bill-of-materials
row renders blank — no material/sub-assembly name, SKU, or unit cost — even though
the underlying `assembly_components` record clearly points at a valid material or
sub-assembly. Labor lines can be worse: a labor line whose type is affected
disappears from the table entirely.

## Root cause

The edit page loads two kinds of data and hands both to `AssemblyForm`:

1. The **saved lines** — `assembly_components` and `assembly_labor` rows for this
   assembly.
2. The **pickable catalog** — `materials`, `assembly_costs` (sub-assemblies), and
   `labor_types`, used to power the "add a part / sub-assembly / labor" search.

The form renders each saved line by **looking its reference up in the catalog list**
(`materialById.get(c.material_id)`, `assemblyById.get(c.child_assembly_id)`,
`laborTypeById.get(l.labor_type_id)`). If the lookup misses, the row falls back to a
placeholder (`"(material)"`, unit cost `0`).

The catalog lists are deliberately narrowed, which is what causes the miss:

- **Active/soft-delete filters** — the queries use `.eq("active", true)` and
  `.is("deleted_at", null)`. A material/fixture/labor-type that was valid when the
  line was created but has since been deactivated or soft-deleted is no longer in the
  list.
- **PostgREST's default 1000-row cap** — an unbounded `select` returns at most ~1000
  rows. In a large catalog, anything past the cap (it's ordered by name) is simply
  absent, so lines pointing at those records can't be resolved.

Labor is the most visible failure: `AssemblyForm` groups labor rows by their type's
`category`. A missing labor type has no category, so the row is filtered out of every
group and never rendered — it looks like the line vanished.

## Fix

After loading the saved lines, load **exactly the records those lines reference**,
unfiltered and keyed by id, and merge them into the catalog lists before passing them
to the form. An `.in("id", [...])` lookup ignores the active/delete filters and isn't
subject to the row cap, so every saved line can always resolve its name/SKU/cost.

See `src/app/dashboard/assemblies/[id]/edit/page.tsx` — it collects the referenced
`material_id`s, `child_assembly_id`s, and `labor_type_id`s that are missing from the
catalog lists and fetches just those, then merges them in.

## The pattern to prefer

The estimates edit page does **not** have this bug because it renders saved lines from
the `erp.estimate_line_details` view, which `LEFT JOIN`s `assemblies`/`materials`
**with no active/deleted filter** and computes the label + rolled-up costs server-side.
The form reads those columns straight from the view instead of re-looking-up a
reference in a filtered client-side list.

**Rule of thumb:** when a saved line references a catalog record, resolve that
reference from data that is *not* filtered by `active` / `deleted_at` and is *not*
subject to the implicit row cap — either via a view that joins unconditionally
(preferred), or by explicitly fetching the referenced ids with `.in(...)`. Keep the
`active`-filtered list only for *new* choices in the "add" search.

## Related / not yet addressed

- **Add-search truncation.** The "add a part / sub-assembly / fixture / labor" search
  boxes filter over the same catalog lists on the client. With more than ~1000
  catalog rows, an item past the cap can't be *found to add* (distinct from an existing
  line failing to render). The real fix there is server-side search rather than
  loading the whole catalog. Watch for this as the catalog grows.
- **Fixture program select.** The assembly header's Program dropdown is also
  `active`-filtered; a fixture assigned to a program that later goes inactive would
  show a blank selection. Same class of issue, lower impact — apply the same
  merge-the-referenced-record approach if it comes up.
