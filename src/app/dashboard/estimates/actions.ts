"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageEstimates } from "@/lib/auth/roles";
import type { EstimateStatus } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export interface EstimateLineInput {
  material_id: string | null;   // set => pull live price from the material
  description: string;
  quantity: number;
  unit_price: number | null;    // required for custom lines; ignored (stored NULL) for material lines
  unit_cost: number | null;
}

export interface EstimateInput {
  id?: string; // present => update, absent => create
  title: string;
  status: EstimateStatus;
  customer_id: string | null;
  customer_name: string;
  contact_email: string;
  contact_phone: string;
  valid_until: string | null; // "YYYY-MM-DD" or null
  notes: string;
  lines: EstimateLineInput[];
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveEstimate(input: EstimateInput): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // RLS (estimates_write → can_manage_estimates) is the real boundary;
  // this check just returns a friendlier error before hitting the DB.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();
  if (!canManageEstimates(profile?.role)) {
    return { ok: false, error: "You don't have permission to manage estimates." };
  }

  // An estimate needs at least one line, and something to identify it by.
  // Material-linked lines (material_id set) store a NULL price and take the
  // material's current price live; custom lines must carry their own price.
  const lines = input.lines
    .map((l) => ({
      material_id: l.material_id,
      description: l.description.trim(),
      quantity: l.quantity,
      unit_price: l.material_id ? null : l.unit_price,
      unit_cost: l.unit_cost,
    }))
    .filter((l) => l.description !== "");

  if (lines.length === 0) {
    return { ok: false, error: "Add at least one line item with a description." };
  }
  for (const l of lines) {
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) {
      return { ok: false, error: `Quantity must be greater than 0 (line: "${l.description}").` };
    }
    if (!l.material_id && (l.unit_price == null || !Number.isFinite(l.unit_price) || l.unit_price < 0)) {
      return { ok: false, error: `Unit price must be 0 or more (line: "${l.description}").` };
    }
  }
  if (!input.title.trim() && !input.customer_id && !input.customer_name.trim()) {
    return { ok: false, error: "Give the estimate a project title or a customer." };
  }

  const header = {
    title: input.title.trim(),
    status: input.status,
    customer_id: input.customer_id,
    customer_name: input.customer_name.trim(),
    contact_email: input.contact_email.trim(),
    contact_phone: input.contact_phone.trim(),
    valid_until: input.valid_until || null,
    notes: input.notes.trim(),
  };

  const erp = await erpSchema();

  // Upsert the header first so we have an id to hang lines off of.
  const headerRes = input.id
    ? await erp.from("estimates").update(header).eq("id", input.id).select("id").single<{ id: string }>()
    : await erp.from("estimates").insert(header).select("id").single<{ id: string }>();

  if (headerRes.error) {
    return { ok: false, error: headerRes.error.message };
  }
  const estimateId = headerRes.data.id;

  // Replace the line set wholesale — simplest correct approach for an
  // edit form (line ids aren't referenced elsewhere).
  if (input.id) {
    const del = await erp.from("estimate_lines").delete().eq("estimate_id", estimateId);
    if (del.error) return { ok: false, error: del.error.message };
  }

  const lineRows = lines.map((l, i) => ({
    estimate_id: estimateId,
    material_id: l.material_id,
    description: l.description,
    quantity: l.quantity,
    unit_price: l.unit_price,
    unit_cost: l.unit_cost,
    position: i,
  }));
  const linesRes = await erp.from("estimate_lines").insert(lineRows);
  if (linesRes.error) {
    return { ok: false, error: linesRes.error.message };
  }

  revalidatePath("/dashboard/estimates");
  return { ok: true, id: estimateId };
}
