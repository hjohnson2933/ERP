"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MaterialStockSummary } from "@/lib/types/erp";

type SortKey = "sku" | "name" | "category" | "default_unit_cost" | "in_stock" | "available";

const dims = (m: MaterialStockSummary) => {
  if (m.thickness == null && m.width == null && m.length == null) return "—";
  const p = (v: number | null) => (v == null ? "·" : String(v));
  return `${p(m.thickness)} × ${p(m.width)} × ${p(m.length)}`;
};

// One lowercased string of every attribute, for the search box.
const haystack = (m: MaterialStockSummary) =>
  [
    m.sku, m.name, m.category, m.description, m.notes, m.unit_of_measure,
    m.default_unit_cost, m.reorder_point, m.thickness, m.width, m.length,
    m.active ? "active" : "inactive",
  ]
    .filter((v) => v != null && v !== "")
    .join(" ")
    .toLowerCase();

export function MaterialsTable({
  materials,
  showReservations,
  canManage,
}: {
  materials: MaterialStockSummary[];
  showReservations: boolean;
  canManage: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? materials.filter((m) => haystack(m).includes(q)) : materials.slice();
    filtered.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === "number" || typeof bv === "number") {
        cmp = (Number(av) || 0) - (Number(bv) || 0);
      } else {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      }
      return asc ? cmp : -cmp;
    });
    return filtered;
  }, [materials, search, sortKey, asc]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const arrow = (key: SortKey) => (key === sortKey ? (asc ? " ↑" : " ↓") : "");
  const th = (key: SortKey, labelText: string, right = false) => (
    <th className={`px-3 py-2 ${right ? "text-right" : ""}`}>
      <button type="button" onClick={() => sortBy(key)} className="font-medium hover:text-ink-text">
        {labelText}
        {arrow(key)}
      </button>
    </th>
  );

  const colCount = 7 + (showReservations ? 2 : 0) + (canManage ? 1 : 0);

  return (
    <div>
      <input
        className="mb-3 w-full max-w-md rounded border border-ink-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search materials — any attribute (SKU, name, category, size…)"
      />
      <div className="overflow-x-auto rounded border border-ink-border bg-ink-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-ink-muted">
              {th("sku", "SKU")}
              {th("name", "Name")}
              {th("category", "Category")}
              <th className="px-3 py-2">Size (T×W×L)</th>
              <th className="px-3 py-2">UOM</th>
              {th("in_stock", "In Stock", true)}
              {th("available", "Available", true)}
              {showReservations && (
                <>
                  <th className="px-3 py-2 text-right">On Hold</th>
                  <th className="px-3 py-2 text-right">Committed</th>
                </>
              )}
              <th className="px-3 py-2 text-right">On Order</th>
              {canManage && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.material_id} className="border-b border-ink-border last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{m.sku}</td>
                <td className="px-3 py-2">
                  {m.name}
                  {!m.active && <span className="ml-2 text-[10px] uppercase text-ink-muted">inactive</span>}
                </td>
                <td className="px-3 py-2 text-ink-muted">{m.category || "—"}</td>
                <td className="px-3 py-2 text-ink-muted tabular-nums">{dims(m)}</td>
                <td className="px-3 py-2 text-ink-muted">{m.unit_of_measure}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.in_stock}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.available}</td>
                {showReservations && (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums">{m.on_hold}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.committed}</td>
                  </>
                )}
                <td className="px-3 py-2 text-right tabular-nums">{m.on_order}</td>
                {canManage && (
                  <td className="px-3 py-2 text-right">
                    <Link href={`/dashboard/materials/${m.material_id}/edit`} className="text-accent hover:underline">
                      Edit
                    </Link>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-3 py-6 text-center text-ink-muted">
                  {search ? "No materials match your search." : "No materials yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
