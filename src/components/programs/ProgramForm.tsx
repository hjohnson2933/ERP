"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProgram } from "@/app/dashboard/programs/actions";
import type { Program, Brand } from "@/lib/types/erp";

type BrandOption = Pick<Brand, "id" | "name">;

const field =
  "w-full rounded border border-ink-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";
const label = "mb-1 block text-sm text-ink-muted";

export function ProgramForm({ brands, program }: { brands: BrandOption[]; program?: Program }) {
  const router = useRouter();
  const editing = Boolean(program);

  const [form, setForm] = useState({
    brand_id: program?.brand_id ?? "",
    name: program?.name ?? "",
    notes: program?.notes ?? "",
    active: program?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await saveProgram({ id: program?.id, ...form });
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push("/dashboard/programs");
    router.refresh();
  }

  if (brands.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Add a brand before creating a program — programs belong to a brand.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <div className="mb-4">
        <label className={label}>Program name *</label>
        <input
          className={field}
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. 2026 Retail Program"
        />
      </div>

      <div className="mb-4">
        <label className={label}>Brand *</label>
        <select
          className={field}
          required
          value={form.brand_id}
          onChange={(e) => setForm((f) => ({ ...f, brand_id: e.target.value }))}
        >
          <option value="" disabled>
            Select a brand…
          </option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className={label}>Notes</label>
        <textarea
          className={field}
          rows={3}
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </div>

      <label className="mb-2 flex items-center gap-2 text-sm text-ink-text">
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
          {saving ? "Saving…" : editing ? "Save changes" : "Create program"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/programs")}
          className="rounded border border-ink-border px-4 py-2 text-sm text-ink-text"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
