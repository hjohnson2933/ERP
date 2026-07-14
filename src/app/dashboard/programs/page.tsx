import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageCatalog } from "@/lib/auth/roles";
import type { Program, Brand } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function ProgramsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  const canManage = canManageCatalog(profile?.role);

  const erp = await erpSchema();
  const [programsRes, brandsRes] = await Promise.all([
    erp
      .from("programs")
      .select("id, brand_id, name, active")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<Pick<Program, "id" | "brand_id" | "name" | "active">[]>(),
    erp.from("brands").select("id, name").returns<Pick<Brand, "id" | "name">[]>(),
  ]);

  const error = programsRes.error || brandsRes.error;
  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load programs: {error.message}</p>;
  }

  const programs = programsRes.data ?? [];
  const brands = brandsRes.data ?? [];
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-text">Programs</h1>
        {canManage && (
          <Link
            href="/dashboard/programs/new"
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            New program
          </Link>
        )}
      </div>
      <div className="overflow-x-auto rounded border border-ink-border bg-ink-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-ink-muted">
              <th className="px-3 py-2">Program</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Active</th>
              {canManage && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {programs.map((p) => (
              <tr key={p.id} className="border-b border-ink-border last:border-0">
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2 text-ink-muted">{brandName(p.brand_id)}</td>
                <td className="px-3 py-2">{p.active ? "Yes" : "No"}</td>
                {canManage && (
                  <td className="px-3 py-2 text-right">
                    <Link href={`/dashboard/programs/${p.id}/edit`} className="text-accent hover:underline">
                      Edit
                    </Link>
                  </td>
                )}
              </tr>
            ))}
            {programs.length === 0 && (
              <tr>
                <td colSpan={canManage ? 4 : 3} className="px-3 py-6 text-center text-ink-muted">
                  No programs yet — create one, then fixtures can be assigned to it.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
