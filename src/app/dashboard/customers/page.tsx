import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageOrders } from "@/lib/auth/roles";
import type { Customer, Brand } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  const canManage = canManageOrders(profile?.role);

  const erp = await erpSchema();
  const [customersRes, brandsRes] = await Promise.all([
    erp
      .from("customers")
      .select("id, brand_id, name, ship_to_city, ship_to_state, phone, email, active")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<Pick<Customer, "id" | "brand_id" | "name" | "ship_to_city" | "ship_to_state" | "phone" | "email" | "active">[]>(),
    erp
      .from("brands")
      .select("id, name")
      .returns<Pick<Brand, "id" | "name">[]>(),
  ]);

  const error = customersRes.error || brandsRes.error;
  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load customers: {error.message}</p>;
  }

  const customers = customersRes.data ?? [];
  const brands = brandsRes.data ?? [];
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-text">Customers</h1>
        {canManage && (
          <Link
            href="/dashboard/customers/new"
            className="rounded bg-status-ready px-3 py-1.5 text-sm font-medium text-white"
          >
            New customer
          </Link>
        )}
      </div>
      <div className="overflow-x-auto rounded border border-ink-border bg-ink-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-ink-muted">
              <th className="px-3 py-2">Dealership</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Active</th>
              {canManage && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-ink-border last:border-0">
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2 text-ink-muted">{brandName(c.brand_id)}</td>
                <td className="px-3 py-2 text-ink-muted">
                  {[c.ship_to_city, c.ship_to_state].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-3 py-2 text-ink-muted">{c.phone || "—"}</td>
                <td className="px-3 py-2 text-ink-muted">{c.email || "—"}</td>
                <td className="px-3 py-2">{c.active ? "Yes" : "No"}</td>
                {canManage && (
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/dashboard/customers/${c.id}/edit`}
                      className="text-status-ready hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                )}
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-3 py-6 text-center text-ink-muted">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
