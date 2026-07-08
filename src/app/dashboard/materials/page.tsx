import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canViewStockReservations } from "@/lib/auth/roles";
import type { MaterialStockSummary } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function MaterialsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  const showReservations = canViewStockReservations(profile?.role);

  const erp = await erpSchema();
  const { data: materials, error } = await erp
    .from("material_stock_summary")
    .select("*")
    .returns<MaterialStockSummary[]>();

  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load materials: {error.message}</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-ink-text">Materials</h1>
      <div className="overflow-x-auto rounded border border-ink-border bg-ink-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-ink-muted">
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">UOM</th>
              <th className="px-3 py-2 text-right">In Stock</th>
              <th className="px-3 py-2 text-right">Available</th>
              {showReservations && (
                <>
                  <th className="px-3 py-2 text-right">On Hold</th>
                  <th className="px-3 py-2 text-right">Committed</th>
                </>
              )}
              <th className="px-3 py-2 text-right">On Order</th>
            </tr>
          </thead>
          <tbody>
            {materials?.map((m) => (
              <tr key={m.material_id} className="border-b border-ink-border last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{m.sku}</td>
                <td className="px-3 py-2">{m.name}</td>
                <td className="px-3 py-2 text-ink-muted">{m.category}</td>
                <td className="px-3 py-2 text-ink-muted">{m.unit_of_measure}</td>
                <td className="px-3 py-2 text-right">{m.in_stock}</td>
                <td className="px-3 py-2 text-right">{m.available}</td>
                {showReservations && (
                  <>
                    <td className="px-3 py-2 text-right">{m.on_hold}</td>
                    <td className="px-3 py-2 text-right">{m.committed}</td>
                  </>
                )}
                <td className="px-3 py-2 text-right">{m.on_order}</td>
              </tr>
            ))}
            {materials?.length === 0 && (
              <tr>
                <td colSpan={showReservations ? 9 : 7} className="px-3 py-6 text-center text-ink-muted">
                  No materials yet — add rows to erp.materials and erp.locations in Supabase to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
