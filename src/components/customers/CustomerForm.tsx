"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCustomer } from "@/app/dashboard/customers/actions";
import type { Customer, Brand } from "@/lib/types/erp";

type BrandOption = Pick<Brand, "id" | "name">;

const field =
  "w-full rounded border border-ink-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent";
const label = "mb-1 block text-sm text-ink-muted";

export function CustomerForm({
  brands,
  customer,
}: {
  brands: BrandOption[];
  customer?: Customer;
}) {
  const router = useRouter();
  const editing = Boolean(customer);

  const [form, setForm] = useState({
    brand_id: customer?.brand_id ?? "",
    name: customer?.name ?? "",
    bill_to_address: customer?.bill_to_address ?? "",
    ship_to_street: customer?.ship_to_street ?? "",
    ship_to_city: customer?.ship_to_city ?? "",
    ship_to_state: customer?.ship_to_state ?? "",
    ship_to_zip: customer?.ship_to_zip ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    fax: customer?.fax ?? "",
    notes: customer?.notes ?? "",
    active: customer?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await saveCustomer({ id: customer?.id, ...form });

    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      return;
    }

    router.push("/dashboard/customers");
    router.refresh();
  }

  if (brands.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Add a brand before creating a customer — customers are tied to a brand
        (add rows to <span className="font-mono text-xs">erp.brands</span> in
        Supabase for now).
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>Dealership name *</label>
          <input className={field} required value={form.name} onChange={set("name")} />
        </div>

        <div>
          <label className={label}>Brand *</label>
          <select className={field} required value={form.brand_id} onChange={set("brand_id")}>
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

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-ink-text">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Active
          </label>
        </div>

        <div className="sm:col-span-2">
          <label className={label}>Bill-to address</label>
          <input className={field} value={form.bill_to_address} onChange={set("bill_to_address")} />
        </div>

        <div className="sm:col-span-2">
          <label className={label}>Ship-to street</label>
          <input className={field} value={form.ship_to_street} onChange={set("ship_to_street")} />
        </div>
        <div>
          <label className={label}>Ship-to city</label>
          <input className={field} value={form.ship_to_city} onChange={set("ship_to_city")} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={label}>State</label>
            <input className={field} value={form.ship_to_state} onChange={set("ship_to_state")} />
          </div>
          <div>
            <label className={label}>ZIP</label>
            <input className={field} value={form.ship_to_zip} onChange={set("ship_to_zip")} />
          </div>
        </div>

        <div>
          <label className={label}>Phone</label>
          <input className={field} value={form.phone} onChange={set("phone")} />
        </div>
        <div>
          <label className={label}>Fax</label>
          <input className={field} value={form.fax} onChange={set("fax")} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Email</label>
          <input type="email" className={field} value={form.email} onChange={set("email")} />
        </div>

        <div className="sm:col-span-2">
          <label className={label}>Notes</label>
          <textarea className={field} rows={3} value={form.notes} onChange={set("notes")} />
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-status-hold">{error}</p>}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Create customer"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard/customers")}
          className="rounded border border-ink-border px-4 py-2 text-sm text-ink-text"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
