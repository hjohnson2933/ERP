"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveMaterial } from "@/app/dashboard/materials/actions";
import type { Material } from "@/lib/types/erp";

const field =
  "w-full rounded border border-ink-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";
const label = "mb-1 block text-sm text-ink-muted";

const numOrNull = (s: string) => (s.trim() === "" ? null : parseFloat(s) || 0);
const intOrNull = (s: string) => (s.trim() === "" ? null : parseInt(s, 10) || 0);
const str = (n: number | null | undefined) => (n == null ? "" : String(n));

export function MaterialForm({ material }: { material?: Material }) {
  const router = useRouter();
  const editing = Boolean(material);

  const [form, setForm] = useState({
    sku: material?.sku ?? "",
    name: material?.name ?? "",
    category: material?.category ?? "",
    unit_of_measure: material?.unit_of_measure ?? "",
    default_unit_cost: str(material?.default_unit_cost),
    reorder_point: str(material?.reorder_point),
    description: material?.description ?? "",
    notes: material?.notes ?? "",
    thickness: str(material?.thickness),
    width: str(material?.width),
    length: str(material?.length),
    active: material?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await saveMaterial({
      id: material?.id,
      sku: form.sku,
      name: form.name,
      category: form.category,
      unit_of_measure: form.unit_of_measure,
      default_unit_cost: numOrNull(form.default_unit_cost),
      reorder_point: intOrNull(form.reorder_point),
      description: form.description,
      notes: form.notes,
      thickness: numOrNull(form.thickness),
      width: numOrNull(form.width),
      length: numOrNull(form.length),
      active: form.active,
    });

    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push("/dashboard/materials");
    router.refresh();
  }

  const isWood = form.category.trim().toLowerCase() === "wood";

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>SKU *</label>
          <input className={field} required value={form.sku} onChange={set("sku")} />
        </div>
        <div>
          <label className={label}>Category</label>
          <input className={field} value={form.category} onChange={set("category")} placeholder="e.g. Wood, Hardware" />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Name *</label>
          <input className={field} required value={form.name} onChange={set("name")} />
        </div>
        <div>
          <label className={label}>Unit of measure *</label>
          <input className={field} required value={form.unit_of_measure} onChange={set("unit_of_measure")} placeholder="e.g. sheet, ft, ea" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>Default unit cost</label>
            <input className={`${field} text-right`} inputMode="decimal" value={form.default_unit_cost} onChange={set("default_unit_cost")} placeholder="0.00" />
          </div>
          <div>
            <label className={label}>Reorder point</label>
            <input className={`${field} text-right`} inputMode="numeric" value={form.reorder_point} onChange={set("reorder_point")} />
          </div>
        </div>
      </div>

      {/* Dimensions — used for the wood category */}
      <div className="mt-4 rounded border border-ink-border bg-ink-surface p-3">
        <div className="mb-2 text-sm font-medium text-ink-text">
          Dimensions{" "}
          <span className="text-xs font-normal text-ink-muted">
            {isWood ? "(in.)" : "— mainly for the Wood category"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={label}>Thickness</label>
            <input className={`${field} text-right`} inputMode="decimal" value={form.thickness} onChange={set("thickness")} />
          </div>
          <div>
            <label className={label}>Width</label>
            <input className={`${field} text-right`} inputMode="decimal" value={form.width} onChange={set("width")} />
          </div>
          <div>
            <label className={label}>Length</label>
            <input className={`${field} text-right`} inputMode="decimal" value={form.length} onChange={set("length")} />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <label className={label}>Description</label>
        <input className={field} value={form.description} onChange={set("description")} />
      </div>
      <div className="mt-4">
        <label className={label}>Notes</label>
        <textarea className={field} rows={2} value={form.notes} onChange={set("notes")} />
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-ink-text">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
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
          {saving ? "Saving…" : editing ? "Save changes" : "Create material"}
        </button>
        <button type="button" onClick={() => router.push("/dashboard/materials")} className="rounded border border-ink-border px-4 py-2 text-sm text-ink-text">
          Cancel
        </button>
      </div>
    </form>
  );
}
