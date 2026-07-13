"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveEstimate } from "@/app/dashboard/estimates/actions";
import { ESTIMATE_STATUS_LABELS } from "@/lib/types/erp";
import type { Estimate, EstimateLineDetail, EstimateStatus, Customer } from "@/lib/types/erp";

type CustomerOption = Pick<Customer, "id" | "name">;
export type MaterialOption = {
  id: string;
  sku: string;
  name: string;
  default_unit_cost: number | null;
  unit_of_measure: string;
};

const field =
  "w-full rounded border border-ink-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";
const label = "mb-1 block text-sm text-ink-muted";

// Lines are held as strings while editing (controlled inputs), parsed on save.
// material_id set => the line is pulled from a material (live price, read-only).
type LineRow = {
  material_id: string | null;
  sku: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  unit_cost: string;
};

const emptyCustomLine = (): LineRow => ({
  material_id: null,
  sku: null,
  description: "",
  quantity: "1",
  unit_price: "",
  unit_cost: "",
});

const currency = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export function EstimateForm({
  customers,
  materials,
  estimate,
  lines: initialLines,
}: {
  customers: CustomerOption[];
  materials: MaterialOption[];
  estimate?: Estimate;
  lines?: EstimateLineDetail[];
}) {
  const router = useRouter();
  const editing = Boolean(estimate);

  const [header, setHeader] = useState({
    title: estimate?.title ?? "",
    status: (estimate?.status ?? "draft") as EstimateStatus,
    customer_id: estimate?.customer_id ?? "",
    customer_name: estimate?.customer_name ?? "",
    contact_email: estimate?.contact_email ?? "",
    contact_phone: estimate?.contact_phone ?? "",
    valid_until: estimate?.valid_until ?? "",
    notes: estimate?.notes ?? "",
  });

  const [lines, setLines] = useState<LineRow[]>(
    initialLines && initialLines.length > 0
      ? initialLines.map((l) => ({
          material_id: l.material_id,
          sku: l.sku,
          description: l.description,
          quantity: String(l.quantity),
          unit_price: String(l.unit_price),
          unit_cost: l.unit_cost == null ? "" : String(l.unit_cost),
        }))
      : []
  );

  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setH =
    (key: keyof typeof header) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setHeader((h) => ({ ...h, [key]: e.target.value }));

  const setLine = (i: number, key: keyof LineRow, value: string) =>
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const removeLine = (i: number) => setLines((rows) => rows.filter((_, idx) => idx !== i));

  const addCustomLine = () => setLines((rows) => [...rows, emptyCustomLine()]);

  const addMaterialLine = (m: MaterialOption) => {
    setLines((rows) => [
      ...rows,
      {
        material_id: m.id,
        sku: m.sku,
        description: m.name,
        quantity: "1",
        unit_price: String(m.default_unit_cost ?? 0),
        unit_cost: "",
      },
    ]);
    setSearch("");
  };

  // Client-side material search (internal catalog is modest; swap for a
  // server search action if it ever gets large).
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return materials
      .filter((m) => m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, materials]);

  const lineTotal = (r: LineRow) => (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0);
  const grandTotal = lines.reduce((sum, r) => sum + lineTotal(r), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await saveEstimate({
      id: estimate?.id,
      title: header.title,
      status: header.status,
      customer_id: header.customer_id || null,
      customer_name: header.customer_name,
      contact_email: header.contact_email,
      contact_phone: header.contact_phone,
      valid_until: header.valid_until || null,
      notes: header.notes,
      lines: lines.map((r) => ({
        material_id: r.material_id,
        description: r.description,
        quantity: parseFloat(r.quantity) || 0,
        unit_price: r.material_id ? null : parseFloat(r.unit_price) || 0,
        unit_cost: r.unit_cost.trim() === "" ? null : parseFloat(r.unit_cost) || 0,
      })),
    });

    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    router.push("/dashboard/estimates");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl">
      {/* Header */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>Project title</label>
          <input className={field} value={header.title} onChange={setH("title")} placeholder="e.g. Lobby reception desk" />
        </div>

        <div>
          <label className={label}>Customer</label>
          <select className={field} value={header.customer_id} onChange={setH("customer_id")}>
            <option value="">— Prospect / not yet a customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Customer / prospect name</label>
          <input
            className={field}
            value={header.customer_name}
            onChange={setH("customer_name")}
            placeholder="Used when no customer is selected"
          />
        </div>

        <div>
          <label className={label}>Contact email</label>
          <input type="email" className={field} value={header.contact_email} onChange={setH("contact_email")} />
        </div>
        <div>
          <label className={label}>Contact phone</label>
          <input className={field} value={header.contact_phone} onChange={setH("contact_phone")} />
        </div>

        <div>
          <label className={label}>Status</label>
          <select className={field} value={header.status} onChange={setH("status")}>
            {(Object.keys(ESTIMATE_STATUS_LABELS) as EstimateStatus[]).map((s) => (
              <option key={s} value={s}>
                {ESTIMATE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Valid until</label>
          <input type="date" className={field} value={header.valid_until ?? ""} onChange={setH("valid_until")} />
        </div>
      </div>

      {/* Line items */}
      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-ink-text">Line items</h2>

        {/* Material search */}
        <div className="relative mb-3 max-w-md">
          <input
            className={field}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search materials by name or SKU to add…"
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded border border-ink-border bg-white shadow-lg">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => addMaterialLine(m)}
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

        <div className="overflow-x-auto rounded border border-ink-border bg-ink-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-border text-left text-ink-muted">
                <th className="px-3 py-2">Description</th>
                <th className="w-24 px-3 py-2 text-right">Qty</th>
                <th className="w-32 px-3 py-2 text-right">Unit price</th>
                <th className="w-32 px-3 py-2 text-right">Unit cost</th>
                <th className="w-32 px-3 py-2 text-right">Total</th>
                <th className="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((r, i) => {
                const custom = r.material_id == null;
                return (
                  <tr
                    key={i}
                    className={
                      custom
                        ? "border-b border-ink-border bg-status-partial/5 last:border-0"
                        : "border-b border-ink-border last:border-0"
                    }
                  >
                    <td className="px-2 py-1.5">
                      {custom ? (
                        <div>
                          <input
                            className={field}
                            value={r.description}
                            onChange={(e) => setLine(i, "description", e.target.value)}
                            placeholder="Custom item description"
                          />
                          <span className="mt-1 inline-block rounded bg-status-partial/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-status-partial">
                            Non-stock
                          </span>
                        </div>
                      ) : (
                        <div className="px-1">
                          <div className="font-medium text-ink-text">{r.description}</div>
                          <div className="font-mono text-xs text-ink-muted">{r.sku}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className={`${field} text-right`}
                        inputMode="decimal"
                        value={r.quantity}
                        onChange={(e) => setLine(i, "quantity", e.target.value)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {custom ? (
                        <input
                          className={`${field} text-right`}
                          inputMode="decimal"
                          value={r.unit_price}
                          onChange={(e) => setLine(i, "unit_price", e.target.value)}
                          placeholder="0.00"
                        />
                      ) : (
                        <div className="px-2 text-right tabular-nums text-ink-text" title="Live price from Materials">
                          {currency(parseFloat(r.unit_price) || 0)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {custom ? (
                        <input
                          className={`${field} text-right`}
                          inputMode="decimal"
                          value={r.unit_cost}
                          onChange={(e) => setLine(i, "unit_cost", e.target.value)}
                          placeholder="—"
                        />
                      ) : (
                        <div className="px-2 text-right text-ink-muted">—</div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{currency(lineTotal(r))}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="text-ink-muted hover:text-status-hold"
                        aria-label="Remove line"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-ink-muted">
                    Search materials above, or add a custom line below.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink-border">
                <td className="px-3 py-2" colSpan={4}>
                  <button type="button" onClick={addCustomLine} className="text-sm font-medium text-accent hover:underline">
                    + Add custom (non-stock) line
                  </button>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{currency(grandTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Prices on material lines are pulled live from the Materials section and update
          automatically when a material is repriced. Non-stock lines are highlighted.
        </p>
      </div>

      <div className="mt-6">
        <label className={label}>Notes</label>
        <textarea className={field} rows={3} value={header.notes} onChange={setH("notes")} />
      </div>

      {error && <p className="mt-4 text-sm text-status-hold">{error}</p>}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Create estimate"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/estimates")}
          className="rounded border border-ink-border px-4 py-2 text-sm text-ink-text"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
