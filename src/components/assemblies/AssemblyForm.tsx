"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveAssembly } from "@/app/dashboard/assemblies/actions";
import type { Assembly, AssemblyComponent } from "@/lib/types/erp";

export type MaterialOption = {
  id: string;
  sku: string;
  name: string;
  category: string;
  default_unit_cost: number | null;
  unit_of_measure: string;
};
export type AssemblyOption = {
  assembly_id: string;
  name: string;
  assembly_number: string | null;
  is_fixture: boolean;
  unit_cost: number;
};
export type ProgramOption = { id: string; name: string };

const field =
  "w-full rounded border border-ink-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";
const label = "mb-1 block text-sm text-ink-muted";
const SUBASSEMBLY_GROUP = "Sub-assemblies";
const CUSTOM_GROUP = "Custom / Non-stock";

const currency = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

type BomRow = {
  kind: "material" | "assembly" | "custom";
  material_id: string | null;
  child_assembly_id: string | null;
  label: string;          // display name (material / sub-assembly)
  sku: string | null;
  category: string;
  unit_cost: number;      // standard cost (material cost or sub-assembly roll-up); 0 for custom
  cost_override: string;  // typed override (material/assembly) or the cost (custom)
  is_override: boolean;   // true => use cost_override instead of unit_cost (always true for custom)
  description: string;    // editable, for custom lines
  quantity: string;
};

export function AssemblyForm({
  assembly,
  components,
  materials,
  assemblies,
  programs,
}: {
  assembly?: Assembly;
  components?: AssemblyComponent[];
  materials: MaterialOption[];
  assemblies: AssemblyOption[];
  programs: ProgramOption[];
}) {
  const router = useRouter();
  const editing = Boolean(assembly);

  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const assemblyById = useMemo(() => new Map(assemblies.map((a) => [a.assembly_id, a])), [assemblies]);

  const [header, setHeader] = useState({
    name: assembly?.name ?? "",
    assembly_number: assembly?.assembly_number ?? "",
    description: assembly?.description ?? "",
    active: assembly?.active ?? true,
    is_fixture: assembly?.is_fixture ?? false,
    program_id: assembly?.program_id ?? "",
  });

  const [rows, setRows] = useState<BomRow[]>(() =>
    (components ?? []).map((c) => {
      const hasOverride = c.unit_cost_override != null;
      const overrideStr = hasOverride ? String(c.unit_cost_override) : "";
      if (c.material_id) {
        const m = materialById.get(c.material_id);
        return {
          kind: "material" as const,
          material_id: c.material_id,
          child_assembly_id: null,
          label: m?.name ?? "(material)",
          sku: m?.sku ?? null,
          category: m?.category?.trim() || "Uncategorized",
          unit_cost: m?.default_unit_cost ?? 0,
          cost_override: overrideStr,
          is_override: hasOverride,
          description: "",
          quantity: String(c.quantity),
        };
      }
      if (c.child_assembly_id) {
        const a = assemblyById.get(c.child_assembly_id);
        return {
          kind: "assembly" as const,
          material_id: null,
          child_assembly_id: c.child_assembly_id,
          label: a?.name ?? "(assembly)",
          sku: a?.assembly_number ?? null,
          category: SUBASSEMBLY_GROUP,
          unit_cost: a?.unit_cost ?? 0,
          cost_override: overrideStr,
          is_override: hasOverride,
          description: "",
          quantity: String(c.quantity),
        };
      }
      // custom (non-stock) line: cost lives in unit_cost_override.
      return {
        kind: "custom" as const,
        material_id: null,
        child_assembly_id: null,
        label: "",
        sku: null,
        category: CUSTOM_GROUP,
        unit_cost: 0,
        cost_override: overrideStr,
        is_override: true,
        description: c.description ?? "",
        quantity: String(c.quantity),
      };
    })
  );

  const [partSearch, setPartSearch] = useState("");
  const [subSearch, setSubSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setRowQty = (i: number, value: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, quantity: value } : r)));
  const setRowCost = (i: number, value: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, cost_override: value, is_override: true } : r)));
  const resetRowCost = (i: number) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, cost_override: "", is_override: false } : r)));
  const setRowDesc = (i: number, value: string) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, description: value } : r)));
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const addMaterial = (m: MaterialOption) => {
    setRows((rs) => [
      ...rs,
      {
        kind: "material",
        material_id: m.id,
        child_assembly_id: null,
        label: m.name,
        sku: m.sku,
        category: m.category?.trim() || "Uncategorized",
        unit_cost: m.default_unit_cost ?? 0,
        cost_override: "",
        is_override: false,
        description: "",
        quantity: "1",
      },
    ]);
    setPartSearch("");
  };

  const addCustom = () =>
    setRows((rs) => [
      ...rs,
      {
        kind: "custom",
        material_id: null,
        child_assembly_id: null,
        label: "",
        sku: null,
        category: CUSTOM_GROUP,
        unit_cost: 0,
        cost_override: "",
        is_override: true,
        description: "",
        quantity: "1",
      },
    ]);
  const addSubAssembly = (a: AssemblyOption) => {
    setRows((rs) => [
      ...rs,
      {
        kind: "assembly",
        material_id: null,
        child_assembly_id: a.assembly_id,
        label: a.name,
        sku: a.assembly_number,
        category: SUBASSEMBLY_GROUP,
        unit_cost: a.unit_cost,
        cost_override: "",
        is_override: false,
        description: "",
        quantity: "1",
      },
    ]);
    setSubSearch("");
  };

  const partMatches = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    if (!q) return [];
    return materials
      .filter((m) => m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q))
      .slice(0, 8);
  }, [partSearch, materials]);

  const subMatches = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    if (!q) return [];
    return assemblies
      .filter((a) => a.assembly_id !== assembly?.id) // can't contain itself
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.assembly_number ?? "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [subSearch, assemblies, assembly?.id]);

  const effectiveCost = (r: BomRow) => (r.is_override ? parseFloat(r.cost_override) || 0 : r.unit_cost);
  const rowTotal = (r: BomRow) => (parseFloat(r.quantity) || 0) * effectiveCost(r);
  const grandTotal = rows.reduce((sum, r) => sum + rowTotal(r), 0);

  // Group rows by category for display while keeping their original index.
  const groups = useMemo(() => {
    const map = new Map<string, { row: BomRow; index: number }[]>();
    rows.forEach((row, index) => {
      const arr = map.get(row.category) ?? [];
      arr.push({ row, index });
      map.set(row.category, arr);
    });
    // Material categories alphabetically, then sub-assemblies, then custom.
    const rank = (c: string) => (c === CUSTOM_GROUP ? 2 : c === SUBASSEMBLY_GROUP ? 1 : 0);
    return [...map.entries()].sort(([a], [b]) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra !== rb ? ra - rb : a.localeCompare(b);
    });
  }, [rows]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await saveAssembly({
      id: assembly?.id,
      name: header.name,
      assembly_number: header.assembly_number || null,
      description: header.description,
      active: header.active,
      is_fixture: header.is_fixture,
      program_id: header.is_fixture ? header.program_id || null : null,
      components: rows.map((r) => ({
        material_id: r.material_id,
        child_assembly_id: r.child_assembly_id,
        description: r.kind === "custom" ? r.description : null,
        quantity: parseFloat(r.quantity) || 0,
        unit_cost_override: r.is_override ? parseFloat(r.cost_override) || 0 : null,
      })),
    });

    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push("/dashboard/assemblies");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl">
      {/* Header */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Name *</label>
          <input className={field} required value={header.name} onChange={(e) => setHeader((h) => ({ ...h, name: e.target.value }))} />
        </div>
        <div>
          <label className={label}>Assembly number</label>
          <input className={field} value={header.assembly_number} onChange={(e) => setHeader((h) => ({ ...h, assembly_number: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Description</label>
          <input className={field} value={header.description} onChange={(e) => setHeader((h) => ({ ...h, description: e.target.value }))} />
        </div>

        <div className="sm:col-span-2 rounded border border-ink-border bg-ink-surface p-3">
          <label className="flex items-center gap-2 text-sm text-ink-text">
            <input
              type="checkbox"
              checked={header.is_fixture}
              onChange={(e) => setHeader((h) => ({ ...h, is_fixture: e.target.checked }))}
            />
            This assembly is a <span className="font-medium">fixture</span> (a finished, sellable item in a program)
          </label>
          {header.is_fixture && (
            <div className="mt-3">
              <label className={label}>Program *</label>
              {programs.length === 0 ? (
                <p className="text-sm text-status-hold">
                  No programs exist yet — create one under Programs first.
                </p>
              ) : (
                <select
                  className={`${field} max-w-sm`}
                  value={header.program_id}
                  onChange={(e) => setHeader((h) => ({ ...h, program_id: e.target.value }))}
                >
                  <option value="" disabled>
                    Select a program…
                  </option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bill of materials */}
      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-ink-text">Bill of materials</h2>

        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Part search */}
          <div className="relative">
            <input
              className={field}
              value={partSearch}
              onChange={(e) => setPartSearch(e.target.value)}
              placeholder="Add a part — search materials by name or SKU…"
            />
            {partMatches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded border border-ink-border bg-white shadow-lg">
                {partMatches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => addMaterial(m)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink-bg"
                    >
                      <span>
                        <span className="font-medium text-ink-text">{m.name}</span>{" "}
                        <span className="font-mono text-xs text-ink-muted">{m.sku}</span>
                      </span>
                      <span className="tabular-nums text-ink-muted">
                        {m.default_unit_cost == null ? "—" : currency(m.default_unit_cost)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Sub-assembly search */}
          <div className="relative">
            <input
              className={field}
              value={subSearch}
              onChange={(e) => setSubSearch(e.target.value)}
              placeholder="Add a sub-assembly — search assemblies…"
            />
            {subMatches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded border border-ink-border bg-white shadow-lg">
                {subMatches.map((a) => (
                  <li key={a.assembly_id}>
                    <button
                      type="button"
                      onClick={() => addSubAssembly(a)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink-bg"
                    >
                      <span>
                        <span className="font-medium text-ink-text">{a.name}</span>{" "}
                        {a.assembly_number && (
                          <span className="font-mono text-xs text-ink-muted">{a.assembly_number}</span>
                        )}
                      </span>
                      <span className="tabular-nums text-ink-muted">{currency(a.unit_cost)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded border border-ink-border bg-ink-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-border text-left text-ink-muted">
                <th className="px-3 py-2">Item</th>
                <th className="w-24 px-3 py-2 text-right">Qty</th>
                <th className="w-32 px-3 py-2 text-right">Unit cost</th>
                <th className="w-32 px-3 py-2 text-right">Ext. cost</th>
                <th className="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([category, entries]) => {
                const subtotal = entries.reduce((s, e) => s + rowTotal(e.row), 0);
                return (
                  <Fragment key={`grp-${category}`}>
                    <tr className="bg-ink-bg/60">
                      <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        {category}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs font-medium text-ink-muted tabular-nums">
                        {currency(subtotal)}
                      </td>
                      <td></td>
                    </tr>
                    {entries.map(({ row, index }) => {
                      const custom = row.kind === "custom";
                      return (
                        <tr key={index} className={custom ? "border-b border-ink-border bg-status-partial/5 last:border-0" : "border-b border-ink-border last:border-0"}>
                          <td className="px-3 py-1.5">
                            {custom ? (
                              <div>
                                <input
                                  className={field}
                                  value={row.description}
                                  onChange={(e) => setRowDesc(index, e.target.value)}
                                  placeholder="Custom item description"
                                />
                                <span className="mt-1 inline-block rounded bg-status-partial/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-status-partial">
                                  Non-stock
                                </span>
                              </div>
                            ) : (
                              <>
                                <div className="font-medium text-ink-text">{row.label}</div>
                                {row.sku && <div className="font-mono text-xs text-ink-muted">{row.sku}</div>}
                              </>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`${field} text-right`}
                              inputMode="decimal"
                              value={row.quantity}
                              onChange={(e) => setRowQty(index, e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            {custom ? (
                              <input
                                className={`${field} text-right`}
                                inputMode="decimal"
                                value={row.cost_override}
                                onChange={(e) => setRowCost(index, e.target.value)}
                                placeholder="0.00"
                              />
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  className={`${field} text-right ${row.is_override ? "border-accent bg-accent-soft" : ""}`}
                                  inputMode="decimal"
                                  value={row.is_override ? row.cost_override : String(row.unit_cost)}
                                  onChange={(e) => setRowCost(index, e.target.value)}
                                  title={row.is_override ? `Overridden — standard ${currency(row.unit_cost)}` : "Standard cost"}
                                />
                                {row.is_override && (
                                  <button
                                    type="button"
                                    onClick={() => resetRowCost(index)}
                                    className="text-accent hover:text-accent-hover"
                                    title={`Reset to standard cost (${currency(row.unit_cost)})`}
                                    aria-label="Reset to standard cost"
                                  >
                                    ↺
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{currency(rowTotal(row))}</td>
                          <td className="px-2 py-1.5 text-center">
                            <button type="button" onClick={() => removeRow(index)} className="text-ink-muted hover:text-status-hold" aria-label="Remove">
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                    Search parts or sub-assemblies above, or add a custom line below.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink-border">
                <td className="px-3 py-2" colSpan={5}>
                  <button type="button" onClick={addCustom} className="text-sm font-medium text-accent hover:underline">
                    + Add custom (non-stock) line
                  </button>
                </td>
              </tr>
              <tr className="border-t border-ink-border">
                <td className="px-3 py-2 text-sm font-semibold text-ink-text" colSpan={3}>
                  Rolled-up material cost
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{currency(grandTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Costs are pulled live from Materials (and rolled up through sub-assemblies). Edit a
          unit cost to override it — overridden cells are highlighted light orange; click ↺ to
          reset to the standard cost. Custom (non-stock) lines are highlighted and take the cost
          you type. The sell price is applied later as a markup on the estimate.
        </p>
      </div>

      <label className="mt-6 flex items-center gap-2 text-sm text-ink-text">
        <input
          type="checkbox"
          checked={header.active}
          onChange={(e) => setHeader((h) => ({ ...h, active: e.target.checked }))}
        />
        Active
      </label>

      {error && <p className="mt-4 text-sm text-status-hold">{error}</p>}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Create assembly"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/assemblies")}
          className="rounded border border-ink-border px-4 py-2 text-sm text-ink-text"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
