import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageOrders } from "@/lib/auth/roles";
import { ORDER_STATUS_LABELS } from "@/lib/types/erp";
import type { Order, Customer } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function OrdersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  const canManage = canManageOrders(profile?.role);

  const erp = await erpSchema();
  const [ordersRes, customersRes] = await Promise.all([
    erp
      .from("orders")
      .select("id, order_number, customer_id, status, job_id, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<Pick<Order, "id" | "order_number" | "customer_id" | "status" | "job_id" | "created_at">[]>(),
    erp
      .from("customers")
      .select("id, name")
      .is("deleted_at", null)
      .returns<Pick<Customer, "id" | "name">[]>(),
  ]);

  const error = ordersRes.error || customersRes.error;
  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load orders: {error.message}</p>;
  }

  const orders = ordersRes.data ?? [];
  const customers = customersRes.data ?? [];
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-text">Orders</h1>
        {canManage && (
          <span className="text-sm text-ink-muted">
            Order creation form coming next — orders can be added via Supabase for now.
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded border border-ink-border bg-ink-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-ink-muted">
              <th className="px-3 py-2">Order #</th>
              <th className="px-3 py-2">Dealership</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Job</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-ink-border last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
                <td className="px-3 py-2">{customerName(o.customer_id)}</td>
                <td className="px-3 py-2">{ORDER_STATUS_LABELS[o.status]}</td>
                <td className="px-3 py-2">{o.job_id ? "Linked" : "—"}</td>
                <td className="px-3 py-2 text-ink-muted">
                  {new Date(o.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
