"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageOrders } from "@/lib/auth/roles";
import type { Profile } from "@/lib/types/shared";

// A brand (program) is the top of the sales hierarchy — customers
// (dealerships) belong to a brand, and order forms are priced per brand.
export interface BrandInput {
  id?: string; // present => update, absent => create
  name: string;
  notes: string;
  active: boolean;
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveBrand(input: BrandInput): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // RLS (brands_write → can_manage_orders) is the real boundary; this
  // check just returns a friendlier error before hitting the database.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();
  if (!canManageOrders(profile?.role)) {
    return { ok: false, error: "You don't have permission to manage brands." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Brand name is required." };

  const payload = {
    name,
    notes: input.notes.trim(),
    active: input.active,
  };

  const erp = await erpSchema();

  const result = input.id
    ? await erp.from("brands").update(payload).eq("id", input.id).select("id").single<{ id: string }>()
    : await erp.from("brands").insert(payload).select("id").single<{ id: string }>();

  if (result.error) {
    return { ok: false, error: result.error.message };
  }

  // Refresh the brands list and anywhere that reads the brand dropdown.
  revalidatePath("/dashboard/brands");
  revalidatePath("/dashboard/customers/new");
  return { ok: true, id: result.data.id };
}
