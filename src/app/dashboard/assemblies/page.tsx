import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageCatalog } from "@/lib/auth/roles";
import type { AssemblyCost, Program } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

const currency = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

export default async function AssembliesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  const canManage = canManageCatalog(profile?.role);

  const erp = await erpSchema();
  const [assembliesRes, programsRes] = await Promise.all([
    erp
      .from("assembly_costs")
      .select(
        "assembly_id, name, assembly_number, is_fixture, program_id, active, unit_cost, material_cost, labor_cost, labor_hours, total_cost"
      )
      .order("name", { ascending: true })
      .returns<AssemblyCost[]>(),
    erp.from("programs").select("id, name").returns<Pick<Program, "id" | "name">[]>(),
  ]);

  const error = assembliesRes.error || programsRes.error;
  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load assemblies: {error.message}</p>;
  }

  const assemblies = assembliesRes.data ?? [];
  const programs = programsRes.data ?? [];
  const programName = (id: string | null) => (id ? programs.find((p) => p.id === id)?.name ?? "—" : "—");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink-text">Assemblies &amp; Fixtures</h1>
        {canManage && (
          <Link
            href="/dashboard/assemblies/new"
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            New assembly
          </Link>
        )}
      </div>
      <div className="overflow-x-auto rounded border border-ink-border bg-ink-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-ink-muted">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Program</th>
              <th className="px-3 py-2 text-right">Material</th>
              <th className="px-3 py-2 text-right">Labor</th>
              <th className="px-3 py-2 text-right">Total cost</th>
              <th className="px-3 py-2">Active</th>
              {canManage && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {assemblies.map((a) => (
              <tr key={a.assembly_id} className="border-b border-ink-border last:border-0">
                <td className="px-3 py-2">{a.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-ink-muted">{a.assembly_number || "—"}</td>
                <td className="px-3 py-2">
                  {a.is_fixture ? (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Fixture</span>
                  ) : (
                    <span className="text-ink-muted">Assembly</span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-muted">{programName(a.program_id)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{currency(a.material_cost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {currency(a.labor_cost)}
                  {a.labor_hours > 0 && (
                    <span className="ml-1 text-xs text-ink-muted">
                      ({a.labor_hours.toLocaleString(undefined, { maximumFractionDigits: 2 })} hr)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{currency(a.total_cost)}</td>
                <td className="px-3 py-2">{a.active ? "Yes" : "No"}</td>
                {canManage && (
                  <td className="px-3 py-2 text-right">
                    <Link href={`/dashboard/assemblies/${a.assembly_id}/edit`} className="text-accent hover:underline">
                      Edit
                    </Link>
                  </td>
                )}
              </tr>
            ))}
            {assemblies.length === 0 && (
              <tr>
                <td colSpan={canManage ? 9 : 8} className="px-3 py-6 text-center text-ink-muted">
                  No assemblies yet — build one from parts in the Materials list.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
