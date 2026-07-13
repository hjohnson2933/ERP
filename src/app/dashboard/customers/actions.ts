"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageOrders } from "@/lib/auth/roles";
import type { Profile } from "@/lib/types/shared";

// Fields the customer form collects. brand_id and name are required;
// everything else has a sensible empty default matching the table.
export interface CustomerInput {
  id?: string; // present => update, absent => create
  brand_id: string;
  name: string;
  bill_to_address: string;
  ship_to_street: string;
  ship_to_city: string;
  ship_to_state: string;
  ship_to_zip: string;
  phone: string;
  email: string;
  fax: string;
  notes: string;
  active: boolean;
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveCustomer(input: CustomerInput): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // RLS (customers_write → can_manage_orders) is the real boundary; this
  // check just returns a friendlier error before hitting the database.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();
  if (!canManageOrders(profile?.role)) {
    return { ok: false, error: "You don't have permission to manage customers." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Customer name is required." };
  if (!input.brand_id) return { ok: false, error: "A brand is required." };

  const payload = {
    brand_id: input.brand_id,
    name,
    bill_to_address: input.bill_to_address.trim(),
    ship_to_street: input.ship_to_street.trim(),
    ship_to_city: input.ship_to_city.trim(),
    ship_to_state: input.ship_to_state.trim(),
    ship_to_zip: input.ship_to_zip.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    fax: input.fax.trim(),
    notes: input.notes.trim(),
    active: input.active,
  };

  const erp = await erpSchema();

  const result = input.id
    ? await erp.from("customers").update(payload).eq("id", input.id).select("id").single<{ id: string }>()
    : await erp.from("customers").insert(payload).select("id").single<{ id: string }>();

  if (result.error) {
    return { ok: false, error: result.error.message };
  }

  revalidatePath("/dashboard/customers");
  return { ok: true, id: result.data.id };
}
