import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageEstimates } from "@/lib/auth/roles";
import { ESTIMATE_STATUS_LABELS } from "@/lib/types/erp";
import type { Estimate, EstimateTotal, Customer } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function EstimatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  const canManage = canManageEstimates(profile?.role);

  const erp = await erpSchema();
  const [estimatesRes, totalsRes, customersRes] = await Promise.all([
    erp
      .from("estimates")
      .select(
        "id, estimate_number, title, status, customer_id, customer_name, valid_until, order_id, created_at, revision_number, revision_of"
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<
        Pick<
          Estimate,
          | "id"
          | "estimate_number"
          | "title"
          | "status"
          | "customer_id"
          | "customer_name"
          | "valid_until"
          | "order_id"
          | "created_at"
          | "revision_number"
          | "revision_of"
        >[]
      >(),
    erp
      .from("estimate_totals")
      .select("estimate_id, is_locked, total")
      .returns<EstimateTotal[]>(),
    erp
      .from("customers")
      .select("id, name")
      .is("deleted_at", null)
      .returns<Pick<Customer, "id" | "name">[]>(),
  ]);

  const error = estimatesRes.error || totalsRes.error || customersRes.error;
  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load estimates: {error.message}</p>;
  }

  const estimates = estimatesRes.data ?? [];
  const totals = totalsRes.data ?? [];
  const customers = customersRes.data ?? [];

  // Effective total (locked snapshot or live) + lock state per estimate.
  const totalByEstimate = new Map<string, number>();
  const lockedByEstimate = new Map<string, boolean>();
  for (const t of totals) {
    totalByEstimate.set(t.estimate_id, Number(t.total));
    lockedByEstimate.set(t.estimate_id, t.is_locked);
  }

  const currency = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD" });

  // Prefer the live customer name; fall back to the header snapshot (prospects).
  const displayCustomer = (e: (typeof estimates)[number]) =>
    (e.customer_id && customers.find((c) => c.id === e.customer_id)?.name) ||
    e.customer_name ||
    "—";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-text">Estimates</h1>
        {canManage && (
          <Link
            href="/dashboard/estimates/new"
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            New estimate
          </Link>
        )}
      </div>
      <div className="overflow-x-auto rounded border border-ink-border bg-ink-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-ink-muted">
              <th className="px-3 py-2">Estimate #</th>
              <th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Valid Until</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Created</th>
              {canManage && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {estimates.map((e) => (
              <tr key={e.id} className="border-b border-ink-border last:border-0">
                <td className="px-3 py-2 font-mono text-xs">
                  {e.estimate_number}
                  {e.revision_number > 1 && (
                    <span className="ml-1 font-sans text-[10px] text-ink-muted">rev {e.revision_number}</span>
                  )}
                </td>
                <td className="px-3 py-2">{e.title || "—"}</td>
                <td className="px-3 py-2">{displayCustomer(e)}</td>
                <td className="px-3 py-2">
                  {ESTIMATE_STATUS_LABELS[e.status]}
                  {e.status === "approved" ? (
                    <span className="ml-2 rounded-full bg-status-complete/15 px-2 py-0.5 text-[10px] font-medium uppercase text-status-complete">
                      Signed off
                    </span>
                  ) : (
                    lockedByEstimate.get(e.id) && (
                      <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium uppercase text-accent">
                        Locked
                      </span>
                    )
                  )}
                </td>
                <td className="px-3 py-2 text-right">{currency(totalByEstimate.get(e.id) ?? 0)}</td>
                <td className="px-3 py-2 text-ink-muted">
                  {e.valid_until ? new Date(e.valid_until).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2">{e.order_id ? "Converted" : "—"}</td>
                <td className="px-3 py-2 text-ink-muted">
                  {new Date(e.created_at).toLocaleDateString()}
                </td>
                {canManage && (
                  <td className="px-3 py-2 text-right">
                    <Link href={`/dashboard/estimates/${e.id}/edit`} className="text-accent hover:underline">
                      {lockedByEstimate.get(e.id) ? "View" : "Edit"}
                    </Link>
                  </td>
                )}
              </tr>
            ))}
            {estimates.length === 0 && (
              <tr>
                <td colSpan={canManage ? 9 : 8} className="px-3 py-6 text-center text-ink-muted">
                  No estimates yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
