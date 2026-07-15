import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageCatalog } from "@/lib/auth/roles";
import {
  AssemblyForm,
  type MaterialOption,
  type AssemblyOption,
  type ProgramOption,
  type LaborTypeOption,
} from "@/components/assemblies/AssemblyForm";
import type { Assembly, AssemblyComponent, AssemblyLabor } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function EditAssemblyPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  if (!canManageCatalog(profile?.role)) redirect("/dashboard/assemblies");

  const erp = await erpSchema();
  const [assemblyRes, componentsRes, laborRes, materialsRes, assembliesRes, programsRes, laborTypesRes] =
    await Promise.all([
      erp.from("assemblies").select("*").eq("id", params.id).is("deleted_at", null).maybeSingle<Assembly>(),
      erp
        .from("assembly_components")
        .select("*")
        .eq("parent_assembly_id", params.id)
        .order("position", { ascending: true })
        .returns<AssemblyComponent[]>(),
      erp
        .from("assembly_labor")
        .select("*")
        .eq("assembly_id", params.id)
        .order("position", { ascending: true })
        .returns<AssemblyLabor[]>(),
      erp
        .from("materials")
        .select("id, sku, name, category, default_unit_cost, unit_of_measure")
        .is("deleted_at", null)
        .eq("active", true)
        .order("name", { ascending: true })
        .returns<MaterialOption[]>(),
      erp
        .from("assembly_costs")
        .select("assembly_id, name, assembly_number, is_fixture, material_cost, labor_cost, labor_hours")
        .eq("active", true)
        .order("name", { ascending: true })
        .returns<AssemblyOption[]>(),
      erp
        .from("programs")
        .select("id, name")
        .is("deleted_at", null)
        .eq("active", true)
        .order("name", { ascending: true })
        .returns<ProgramOption[]>(),
      erp
        .from("labor_types")
        .select("id, category, name, rate")
        .eq("active", true)
        .order("category", { ascending: true })
        .order("position", { ascending: true })
        .returns<LaborTypeOption[]>(),
    ]);

  const error =
    assemblyRes.error ||
    componentsRes.error ||
    laborRes.error ||
    materialsRes.error ||
    assembliesRes.error ||
    programsRes.error ||
    laborTypesRes.error;
  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load assembly: {error.message}</p>;
  }
  if (!assemblyRes.data) notFound();

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/assemblies" className="text-sm text-ink-muted hover:underline">
          ← Assemblies
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-text">Edit assembly</h1>
      </div>
      <AssemblyForm
        assembly={assemblyRes.data}
        components={componentsRes.data ?? []}
        labor={laborRes.data ?? []}
        materials={materialsRes.data ?? []}
        assemblies={assembliesRes.data ?? []}
        programs={programsRes.data ?? []}
        laborTypes={laborTypesRes.data ?? []}
      />
    </div>
  );
}
