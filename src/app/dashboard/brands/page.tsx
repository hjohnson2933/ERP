import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageOrders } from "@/lib/auth/roles";
import type { Brand } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function BrandsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  const canManage = canManageOrders(profile?.role);

  const erp = await erpSchema();
  const { data: brands, error } = await erp
    .from("brands")
    .select("id, name, notes, active")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .returns<Pick<Brand, "id" | "name" | "notes" | "active">[]>();

  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load brands: {error.message}</p>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-text">Brands</h1>
        {canManage && (
          <Link
            href="/dashboard/brands/new"
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            New brand
          </Link>
        )}
      </div>
      <div className="overflow-x-auto rounded border border-ink-border bg-ink-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-ink-muted">
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2">Active</th>
              {canManage && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {(brands ?? []).map((b) => (
              <tr key={b.id} className="border-b border-ink-border last:border-0">
                <td className="px-3 py-2">{b.name}</td>
                <td className="px-3 py-2 text-ink-muted">{b.notes || "—"}</td>
                <td className="px-3 py-2">{b.active ? "Yes" : "No"}</td>
                {canManage && (
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/dashboard/brands/${b.id}/edit`}
                      className="text-accent hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                )}
              </tr>
            ))}
            {(brands ?? []).length === 0 && (
              <tr>
                <td colSpan={canManage ? 4 : 3} className="px-3 py-6 text-center text-ink-muted">
                  No brands yet — add one to get started, then customers can be tied to it.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
