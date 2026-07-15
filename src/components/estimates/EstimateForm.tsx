"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveEstimate } from "@/app/dashboard/estimates/actions";
import { ESTIMATE_STATUS_LABELS } from "@/lib/types/erp";
import type { Estimate, EstimateLineDetail, EstimateStatus, Customer } from "@/lib/types/erp";

type CustomerOption = Pick<Customer, "id" | "name">;
export type FixtureOption = {
  assembly_id: string;
  name: string;
  assembly_number: string | null;
  material_cost: number;
  labor_cost: number;
};

const field =
  "w-full rounded border border-ink-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";
const label = "mb-1 block text-sm text-ink-muted";

const currency = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

// Rows are held as strings while editing; parsed on save.
type LineRow = {
  kind: "fixture" | "custom";
  fixture_id: string | null;
  label: string;           // fixture name
  sku: string | null;
  material_cost: number;   // fixture rolled-up material cost (live)
  labor_cost: number;      // fixture rolled-up labor cost (live)
  description: string;     // custom description
  unit_price: string;      // custom sell price
  material_markup: string; // per-line override ("" => inherit estimate default)
  labor_markup: string;    // per-line override ("" => inherit estimate default)
  quantity: string;
};

export function EstimateForm({
  customers,
  fixtures,
  estimate,
  lines: initialLines,
}: {
  customers: CustomerOption[];
  fixtures: FixtureOption[];
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
    material_markup_pct: estimate?.material_markup_pct != null ? String(estimate.material_markup_pct) : "0",
    labor_markup_pct: estimate?.labor_markup_pct != null ? String(estimate.labor_markup_pct) : "0",
    notes: estimate?.notes ?? "",
  });

  const [lines, setLines] = useState<LineRow[]>(
    (initialLines ?? []).map((l) => {
      if (l.kind === "fixture") {
        return {
          kind: "fixture",
          fixture_id: l.fixture_id,
          label: l.description,
          sku: l.sku,
          material_cost: l.material_cost ?? 0,
          labor_cost: l.labor_cost ?? 0,
          description: "",
          unit_price: "",
          material_markup: l.material_markup_override == null ? "" : String(l.material_markup_override),
          labor_markup: l.labor_markup_override == null ? "" : String(l.labor_markup_override),
          quantity: String(l.quantity),
        };
      }
      // material (legacy) and custom both edit as a custom line
      return {
        kind: "custom",
        fixture_id: null,
        label: "",
        sku: null,
        material_cost: 0,
        labor_cost: 0,
        description: l.description,
        unit_price: String(l.unit_price),
        material_markup: "",
        labor_markup: "",
        quantity: String(l.quantity),
      };
    })
  );

  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const estimateMaterialMarkup = parseFloat(header.material_markup_pct) || 0;
  const estimateLaborMarkup = parseFloat(header.labor_markup_pct) || 0;

  const setH =
    (key: keyof typeof header) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setHeader((h) => ({ ...h, [key]: e.target.value }));

  const setLine = (i: number, key: keyof LineRow, value: string) =>
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  const removeLine = (i: number) => setLines((rows) => rows.filter((_, idx) => idx !== i));

  const addFixture = (f: FixtureOption) => {
    setLines((rows) => [
      ...rows,
      {
        kind: "fixture",
        fixture_id: f.assembly_id,
        label: f.name,
        sku: f.assembly_number,
        material_cost: f.material_cost,
        labor_cost: f.labor_cost,
        description: "",
        unit_price: "",
        material_markup: "",
        labor_markup: "",
        quantity: "1",
      },
    ]);
    setSearch("");
  };
  const addCustom = () =>
    setLines((rows) => [
      ...rows,
      {
        kind: "custom",
        fixture_id: null,
        label: "",
        sku: null,
        material_cost: 0,
        labor_cost: 0,
        description: "",
        unit_price: "",
        material_markup: "",
        labor_markup: "",
        quantity: "1",
      },
    ]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return fixtures
      .filter((f) => f.name.toLowerCase().includes(q) || (f.assembly_number ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, fixtures]);

  // Effective markups for a row: a blank override inherits the estimate default.
  const rowMaterialMarkup = (r: LineRow) =>
    r.material_markup.trim() === "" ? estimateMaterialMarkup : parseFloat(r.material_markup) || 0;
  const rowLaborMarkup = (r: LineRow) =>
    r.labor_markup.trim() === "" ? estimateLaborMarkup : parseFloat(r.labor_markup) || 0;

  // Mirrors erp.estimate_line_details: each cost component is marked up at
  // its own rate. Custom lines have no split — they keep a typed price.
  const sellPrice = (r: LineRow) =>
    r.kind === "fixture"
      ? r.material_cost * (1 + rowMaterialMarkup(r) / 100) +
        r.labor_cost * (1 + rowLaborMarkup(r) / 100)
      : parseFloat(r.unit_price) || 0;
  const lineTotal = (r: LineRow) => (parseFloat(r.quantity) || 0) * sellPrice(r);
  const grandTotal = lines.reduce((sum, r) => sum + lineTotal(r), 0);

  const costTotals = lines.reduce(
    (acc, r) => {
      const qty = parseFloat(r.quantity) || 0;
      return {
        material: acc.material + qty * r.material_cost,
        labor: acc.labor + qty * r.labor_cost,
      };
    },
    { material: 0, labor: 0 }
  );

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
      material_markup_pct: estimateMaterialMarkup,
      labor_markup_pct: estimateLaborMarkup,
      notes: header.notes,
      lines: lines.map((r) => ({
        fixture_id: r.kind === "fixture" ? r.fixture_id : null,
        description: r.description,
        quantity: parseFloat(r.quantity) || 0,
        unit_price: r.kind === "custom" ? parseFloat(r.unit_price) || 0 : null,
        material_markup_pct:
          r.kind === "fixture" && r.material_markup.trim() !== "" ? parseFloat(r.material_markup) || 0 : null,
        labor_markup_pct:
          r.kind === "fixture" && r.labor_markup.trim() !== "" ? parseFloat(r.labor_markup) || 0 : null,
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
    <form onSubmit={handleSubmit} className="max-w-5xl">
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
          <input className={field} value={header.customer_name} onChange={setH("customer_name")} placeholder="Used when no customer is selected" />
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
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={label}>Material markup %</label>
            <input
              className={`${field} text-right`}
              inputMode="decimal"
              value={header.material_markup_pct}
              onChange={setH("material_markup_pct")}
            />
          </div>
          <div>
            <label className={label}>Labor markup %</label>
            <input
              className={`${field} text-right`}
              inputMode="decimal"
              value={header.labor_markup_pct}
              onChange={setH("labor_markup_pct")}
            />
          </div>
          <div>
            <label className={label}>Valid until</label>
            <input type="date" className={field} value={header.valid_until ?? ""} onChange={setH("valid_until")} />
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-ink-text">Line items</h2>

        <div className="relative mb-3 max-w-md">
          <input
            className={field}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fixtures by name or number to add…"
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded border border-ink-border bg-white shadow-lg">
              {matches.map((f) => (
                <li key={f.assembly_id}>
                  <button
                    type="button"
                    onClick={() => addFixture(f)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-ink-bg"
                  >
                    <span>
                      <span className="font-medium text-ink-text">{f.name}</span>{" "}
                      {f.assembly_number && <span className="font-mono text-xs text-ink-muted">{f.assembly_number}</span>}
                    </span>
                    <span className="tabular-nums text-ink-muted">
                      cost {currency(f.material_cost + f.labor_cost)}
                      <span className="ml-1 text-xs">
                        (mat {currency(f.material_cost)} · lab {currency(f.labor_cost)})
                      </span>
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
                <th className="px-3 py-2">Item</th>
                <th className="w-20 px-3 py-2 text-right">Qty</th>
                <th className="w-28 px-3 py-2 text-right">Material cost</th>
                <th className="w-20 px-3 py-2 text-right">Mat. %</th>
                <th className="w-28 px-3 py-2 text-right">Labor cost</th>
                <th className="w-20 px-3 py-2 text-right">Lab. %</th>
                <th className="w-28 px-3 py-2 text-right">Sell price</th>
                <th className="w-28 px-3 py-2 text-right">Total</th>
                <th className="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((r, i) => {
                const custom = r.kind === "custom";
                return (
                  <tr
                    key={i}
                    className={custom ? "border-b border-ink-border bg-status-partial/5 last:border-0" : "border-b border-ink-border last:border-0"}
                  >
                    <td className="px-2 py-1.5">
                      {custom ? (
                        <div>
                          <input className={field} value={r.description} onChange={(e) => setLine(i, "description", e.target.value)} placeholder="Custom item description" />
                          <span className="mt-1 inline-block rounded bg-status-partial/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-status-partial">
                            Non-stock
                          </span>
                        </div>
                      ) : (
                        <div className="px-1">
                          <div className="font-medium text-ink-text">{r.label}</div>
                          {r.sku && <div className="font-mono text-xs text-ink-muted">{r.sku}</div>}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={`${field} text-right`} inputMode="decimal" value={r.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">
                      {custom ? "—" : currency(r.material_cost)}
                    </td>
                    <td className="px-2 py-1.5">
                      {custom ? (
                        <div className="px-2 text-right text-ink-muted">—</div>
                      ) : (
                        <input
                          className={`${field} text-right ${
                            r.material_markup.trim() !== "" ? "!border-accent !bg-accent-soft font-semibold text-accent" : ""
                          }`}
                          inputMode="decimal"
                          value={r.material_markup}
                          onChange={(e) => setLine(i, "material_markup", e.target.value)}
                          placeholder={String(estimateMaterialMarkup)}
                          title={
                            r.material_markup.trim() !== ""
                              ? `Overridden — estimate default ${estimateMaterialMarkup}%`
                              : "Inheriting the estimate default"
                          }
                        />
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">
                      {custom ? "—" : currency(r.labor_cost)}
                    </td>
                    <td className="px-2 py-1.5">
                      {custom ? (
                        <div className="px-2 text-right text-ink-muted">—</div>
                      ) : (
                        <input
                          className={`${field} text-right ${
                            r.labor_markup.trim() !== "" ? "!border-accent !bg-accent-soft font-semibold text-accent" : ""
                          }`}
                          inputMode="decimal"
                          value={r.labor_markup}
                          onChange={(e) => setLine(i, "labor_markup", e.target.value)}
                          placeholder={String(estimateLaborMarkup)}
                          title={
                            r.labor_markup.trim() !== ""
                              ? `Overridden — estimate default ${estimateLaborMarkup}%`
                              : "Inheriting the estimate default"
                          }
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {custom ? (
                        <input className={`${field} text-right`} inputMode="decimal" value={r.unit_price} onChange={(e) => setLine(i, "unit_price", e.target.value)} placeholder="0.00" />
                      ) : (
                        <div className="px-2 text-right tabular-nums text-ink-text">{currency(sellPrice(r))}</div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{currency(lineTotal(r))}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button type="button" onClick={() => removeLine(i)} className="text-ink-muted hover:text-status-hold" aria-label="Remove line">
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-ink-muted">
                    Search fixtures above, or add a custom line below.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink-border">
                <td className="px-3 py-2" colSpan={7}>
                  <button type="button" onClick={addCustom} className="text-sm font-medium text-accent hover:underline">
                    + Add custom (non-stock) line
                  </button>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{currency(grandTotal)}</td>
                <td></td>
              </tr>
              <tr className="border-t border-ink-border text-xs text-ink-muted">
                <td className="px-3 py-2" colSpan={2}>
                  Cost before markup
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{currency(costTotals.material)}</td>
                <td></td>
                <td className="px-3 py-2 text-right tabular-nums">{currency(costTotals.labor)}</td>
                <td colSpan={2}></td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {currency(costTotals.material + costTotals.labor)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Fixture sell price = material cost × (1 + material markup) + labor cost × (1 + labor
          markup), both rolled up through sub-assemblies. The percentages above are the estimate
          defaults; leave a line&apos;s markup blank to inherit, or type an override — overridden
          cells are highlighted light orange. Custom (non-stock) lines have no cost split and take
          the sell price you type.
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
        <button type="button" onClick={() => router.push("/dashboard/estimates")} className="rounded border border-ink-border px-4 py-2 text-sm text-ink-text">
          Cancel
        </button>
      </div>
    </form>
  );
}
