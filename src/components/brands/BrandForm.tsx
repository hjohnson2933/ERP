"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveBrand } from "@/app/dashboard/brands/actions";
import type { Brand } from "@/lib/types/erp";

const field =
  "w-full rounded border border-ink-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";
const label = "mb-1 block text-sm text-ink-muted";

export function BrandForm({ brand }: { brand?: Brand }) {
  const router = useRouter();
  const editing = Boolean(brand);

  const [form, setForm] = useState({
    name: brand?.name ?? "",
    notes: brand?.notes ?? "",
    active: brand?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await saveBrand({ id: brand?.id, ...form });

    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    router.push("/dashboard/brands");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl">
      <div className="mb-4">
        <label className={label}>Brand name *</label>
        <input
          className={field}
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
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
          {saving ? "Saving…" : editing ? "Save changes" : "Create brand"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/brands")}
          className="rounded border border-ink-border px-4 py-2 text-sm text-ink-text"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
