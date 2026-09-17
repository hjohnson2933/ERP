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

  // The option lists above are the *pickable* catalog: active, non-deleted,
  // and capped by PostgREST's default row limit. But a BOM line can point at
  // a material or sub-assembly that has since been deactivated, soft-deleted,
  // or simply falls beyond that cap in a large catalog — and those lines must
  // still render with their name/SKU/cost. Load exactly the records this
  // assembly's components reference and merge in any the option lists miss.
  const components = componentsRes.data ?? [];
  const laborLines = laborRes.data ?? [];
  const materials = materialsRes.data ?? [];
  const assemblies = assembliesRes.data ?? [];
  const laborTypes = laborTypesRes.data ?? [];

  const knownMaterialIds = new Set(materials.map((m) => m.id));
  const missingMaterialIds = [
    ...new Set(
      components
        .map((c) => c.material_id)
        .filter((id): id is string => Boolean(id) && !knownMaterialIds.has(id!))
    ),
  ];

  const knownAssemblyIds = new Set(assemblies.map((a) => a.assembly_id));
  const missingAssemblyIds = [
    ...new Set(
      components
        .map((c) => c.child_assembly_id)
        .filter((id): id is string => Boolean(id) && !knownAssemblyIds.has(id!))
    ),
  ];

  // Labor lines are even more sensitive: the form groups them by their
  // type's category, so a line whose labor type is missing from the list
  // is dropped from every group and never rendered at all.
  const knownLaborTypeIds = new Set(laborTypes.map((t) => t.id));
  const missingLaborTypeIds = [
    ...new Set(laborLines.map((l) => l.labor_type_id).filter((id) => !knownLaborTypeIds.has(id))),
  ];

  const [referencedMaterialsRes, referencedAssembliesRes, referencedLaborTypesRes] = await Promise.all([
    missingMaterialIds.length
      ? erp
          .from("materials")
          .select("id, sku, name, category, default_unit_cost, unit_of_measure")
          .in("id", missingMaterialIds)
          .returns<MaterialOption[]>()
      : Promise.resolve({ data: [] as MaterialOption[], error: null }),
    missingAssemblyIds.length
      ? erp
          .from("assembly_costs")
          .select("assembly_id, name, assembly_number, is_fixture, material_cost, labor_cost, labor_hours")
          .in("assembly_id", missingAssemblyIds)
          .returns<AssemblyOption[]>()
      : Promise.resolve({ data: [] as AssemblyOption[], error: null }),
    missingLaborTypeIds.length
      ? erp
          .from("labor_types")
          .select("id, category, name, rate")
          .in("id", missingLaborTypeIds)
          .returns<LaborTypeOption[]>()
      : Promise.resolve({ data: [] as LaborTypeOption[], error: null }),
  ]);

  const referenceError =
    referencedMaterialsRes.error || referencedAssembliesRes.error || referencedLaborTypesRes.error;
  if (referenceError) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load assembly: {referenceError.message}</p>;
  }

  const allMaterials = [...materials, ...(referencedMaterialsRes.data ?? [])];
  const allAssemblies = [...assemblies, ...(referencedAssembliesRes.data ?? [])];
  const allLaborTypes = [...laborTypes, ...(referencedLaborTypesRes.data ?? [])];

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
        components={components}
        labor={laborLines}
        materials={allMaterials}
        assemblies={allAssemblies}
        programs={programsRes.data ?? []}
        laborTypes={allLaborTypes}
      />
    </div>
  );
}
