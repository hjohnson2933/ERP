"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageMaterials } from "@/lib/auth/roles";
import type { Profile } from "@/lib/types/shared";

export interface MaterialInput {
  id?: string;
  sku: string;
  name: string;
  category: string;
  unit_of_measure: string;
  default_unit_cost: number | null;
  reorder_point: number | null;
  description: string;
  notes: string;
  thickness: number | null;
  width: number | null;
  length: number | null;
  active: boolean;
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveMaterial(input: MaterialInput): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();
  if (!canManageMaterials(profile?.role)) {
    return { ok: false, error: "You don't have permission to manage materials." };
  }

  const sku = input.sku.trim();
  const name = input.name.trim();
  const uom = input.unit_of_measure.trim();
  if (!sku) return { ok: false, error: "SKU is required." };
  if (!name) return { ok: false, error: "Name is required." };
  if (!uom) return { ok: false, error: "Unit of measure is required." };

  const payload = {
    sku,
    name,
    category: input.category.trim(),
    unit_of_measure: uom,
    default_unit_cost: input.default_unit_cost,
    reorder_point: input.reorder_point,
    description: input.description.trim(),
    notes: input.notes.trim(),
    thickness: input.thickness,
    width: input.width,
    length: input.length,
    active: input.active,
  };

  const erp = await erpSchema();
  const result = input.id
    ? await erp.from("materials").update(payload).eq("id", input.id).select("id").single<{ id: string }>()
    : await erp.from("materials").insert(payload).select("id").single<{ id: string }>();

  if (result.error) {
    // Friendlier message for the unique SKU collision.
    if (result.error.code === "23505") {
      return { ok: false, error: `A material with SKU "${sku}" already exists.` };
    }
    return { ok: false, error: result.error.message };
  }

  revalidatePath("/dashboard/materials");
  return { ok: true, id: result.data.id };
}
