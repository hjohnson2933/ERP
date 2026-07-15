import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canViewStockReservations, canManageMaterials } from "@/lib/auth/roles";
import { MaterialsTable } from "@/components/materials/MaterialsTable";
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
  const canManage = canManageMaterials(profile?.role);

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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-text">Materials</h1>
        {canManage && (
          <Link
            href="/dashboard/materials/new"
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            New material
          </Link>
        )}
      </div>
      <MaterialsTable
        materials={materials ?? []}
        showReservations={showReservations}
        canManage={canManage}
      />
    </div>
  );
}
