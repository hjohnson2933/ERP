"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveEstimate } from "@/app/dashboard/estimates/actions";
import { ESTIMATE_STATUS_LABELS } from "@/lib/types/erp";
import type { Estimate, EstimateLine, EstimateStatus, Customer } from "@/lib/types/erp";

type CustomerOption = Pick<Customer, "id" | "name">;

const field =
  "w-full rounded border border-ink-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";
const label = "mb-1 block text-sm text-ink-muted";

// Lines are held as strings while editing (controlled inputs), parsed on save.
type LineRow = { description: string; quantity: string; unit_price: string; unit_cost: string };

const emptyLine = (): LineRow => ({ description: "", quantity: "1", unit_price: "", unit_cost: "" });

const currency = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export function EstimateForm({
  customers,
  estimate,
  lines: initialLines,
}: {
  customers: CustomerOption[];
  estimate?: Estimate;
  lines?: EstimateLine[];
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
          description: l.description,
          quantity: String(l.quantity),
          unit_price: String(l.unit_price),
          unit_cost: l.unit_cost == null ? "" : String(l.unit_cost),
        }))
      : [emptyLine()]
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setH =
    (key: keyof typeof header) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setHeader((h) => ({ ...h, [key]: e.target.value }));

  const setLine = (i: number, key: keyof LineRow, value: string) =>
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const addLine = () => setLines((rows) => [...rows, emptyLine()]);
  const removeLine = (i: number) =>
    setLines((rows) => (rows.length === 1 ? rows : rows.filter((_, idx) => idx !== i)));

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
        description: r.description,
        quantity: parseFloat(r.quantity) || 0,
        unit_price: parseFloat(r.unit_price) || 0,
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
              {lines.map((r, i) => (
                <tr key={i} className="border-b border-ink-border last:border-0">
                  <td className="px-2 py-1.5">
                    <input
                      className={field}
                      value={r.description}
                      onChange={(e) => setLine(i, "description", e.target.value)}
                      placeholder="Item description"
                    />
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
                    <input
                      className={`${field} text-right`}
                      inputMode="decimal"
                      value={r.unit_price}
                      onChange={(e) => setLine(i, "unit_price", e.target.value)}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className={`${field} text-right`}
                      inputMode="decimal"
                      value={r.unit_cost}
                      onChange={(e) => setLine(i, "unit_cost", e.target.value)}
                      placeholder="—"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{currency(lineTotal(r))}</td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      disabled={lines.length === 1}
                      className="text-ink-muted hover:text-status-hold disabled:opacity-30"
                      aria-label="Remove line"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-ink-border">
                <td className="px-3 py-2" colSpan={4}>
                  <button type="button" onClick={addLine} className="text-sm font-medium text-accent hover:underline">
                    + Add line
                  </button>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{currency(grandTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
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
