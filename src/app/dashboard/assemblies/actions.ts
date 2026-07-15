"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageCatalog } from "@/lib/auth/roles";
import type { Profile } from "@/lib/types/shared";

// One BOM line: a material (part) OR a child assembly (sub-assembly).
export interface AssemblyComponentInput {
  material_id: string | null;
  child_assembly_id: string | null;
  description: string | null;        // set for custom (non-stock) lines
  quantity: number;
  unit_cost_override: number | null; // null => standard cost; for custom lines, the cost
}

export interface AssemblyInput {
  id?: string;
  name: string;
  assembly_number: string | null;
  description: string;
  active: boolean;
  is_fixture: boolean;
  program_id: string | null;
  components: AssemblyComponentInput[];
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveAssembly(input: AssemblyInput): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();
  if (!canManageCatalog(profile?.role)) {
    return { ok: false, error: "You don't have permission to manage assemblies." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Assembly name is required." };

  const isFixture = input.is_fixture;
  const programId = isFixture ? input.program_id : null;
  if (isFixture && !programId) {
    return { ok: false, error: "A fixture must be assigned to a program." };
  }

  // Keep material, sub-assembly, or custom (both refs null + description) lines.
  const components = input.components.filter(
    (c) =>
      (c.material_id && !c.child_assembly_id) ||
      (!c.material_id && c.child_assembly_id) ||
      (!c.material_id && !c.child_assembly_id && (c.description ?? "").trim() !== "")
  );
  if (components.length === 0) {
    return { ok: false, error: "Add at least one part, sub-assembly, or custom line to the bill of materials." };
  }
  for (const c of components) {
    if (!Number.isFinite(c.quantity) || c.quantity <= 0) {
      return { ok: false, error: "Every BOM line needs a quantity greater than 0." };
    }
    if (c.child_assembly_id && c.child_assembly_id === input.id) {
      return { ok: false, error: "An assembly can't contain itself." };
    }
    if (c.unit_cost_override != null && (!Number.isFinite(c.unit_cost_override) || c.unit_cost_override < 0)) {
      return { ok: false, error: "A line cost must be 0 or more." };
    }
  }

  const header = {
    name,
    assembly_number: input.assembly_number?.trim() || null,
    description: input.description.trim(),
    active: input.active,
    is_fixture: isFixture,
    program_id: programId,
  };

  const erp = await erpSchema();

  const headerRes = input.id
    ? await erp.from("assemblies").update(header).eq("id", input.id).select("id").single<{ id: string }>()
    : await erp.from("assemblies").insert(header).select("id").single<{ id: string }>();

  if (headerRes.error) return { ok: false, error: headerRes.error.message };
  const assemblyId = headerRes.data.id;

  // Replace the BOM wholesale. The DB trigger rejects circular references.
  if (input.id) {
    const del = await erp.from("assembly_components").delete().eq("parent_assembly_id", assemblyId);
    if (del.error) return { ok: false, error: del.error.message };
  }

  const rows = components.map((c, i) => {
    const isCustom = !c.material_id && !c.child_assembly_id;
    return {
      parent_assembly_id: assemblyId,
      material_id: c.material_id,
      child_assembly_id: c.child_assembly_id,
      description: isCustom ? (c.description ?? "").trim() : null,
      quantity: c.quantity,
      unit_cost_override: c.unit_cost_override,
      position: i,
    };
  });
  const compRes = await erp.from("assembly_components").insert(rows);
  if (compRes.error) return { ok: false, error: compRes.error.message };

  revalidatePath("/dashboard/assemblies");
  return { ok: true, id: assemblyId };
}
