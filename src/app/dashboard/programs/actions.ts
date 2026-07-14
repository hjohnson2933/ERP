"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageCatalog } from "@/lib/auth/roles";
import type { Profile } from "@/lib/types/shared";

// A program is a brand's set of active fixtures.
export interface ProgramInput {
  id?: string;
  brand_id: string;
  name: string;
  notes: string;
  active: boolean;
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveProgram(input: ProgramInput): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();
  if (!canManageCatalog(profile?.role)) {
    return { ok: false, error: "You don't have permission to manage programs." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Program name is required." };
  if (!input.brand_id) return { ok: false, error: "A brand is required." };

  const payload = {
    brand_id: input.brand_id,
    name,
    notes: input.notes.trim(),
    active: input.active,
  };

  const erp = await erpSchema();
  const result = input.id
    ? await erp.from("programs").update(payload).eq("id", input.id).select("id").single<{ id: string }>()
    : await erp.from("programs").insert(payload).select("id").single<{ id: string }>();

  if (result.error) return { ok: false, error: result.error.message };

  revalidatePath("/dashboard/programs");
  revalidatePath("/dashboard/assemblies/new");
  return { ok: true, id: result.data.id };
}
