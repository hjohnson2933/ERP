"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageEstimates } from "@/lib/auth/roles";
import type { EstimateStatus } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

// One estimate line: a fixture (priced live at rolled-up cost × markup)
// or a custom (non-stock) line with a typed sell price.
export interface EstimateLineInput {
  fixture_id: string | null;   // set => fixture line
  description: string;         // custom-line description
  quantity: number;
  unit_price: number | null;  // custom sell price; null for fixtures
  // Fixture per-line markup overrides; null => inherit the estimate default.
  material_markup_pct: number | null;
  labor_markup_pct: number | null;
}

export interface EstimateInput {
  id?: string;
  title: string;
  status: EstimateStatus;
  customer_id: string | null;
  customer_name: string;
  contact_email: string;
  contact_phone: string;
  valid_until: string | null;
  // Estimate-wide default markups, applied to each cost component.
  material_markup_pct: number;
  labor_markup_pct: number;
  notes: string;
  lines: EstimateLineInput[];
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveEstimate(input: EstimateInput): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();
  if (!canManageEstimates(profile?.role)) {
    return { ok: false, error: "You don't have permission to manage estimates." };
  }

  if (!Number.isFinite(input.material_markup_pct) || input.material_markup_pct < 0) {
    return { ok: false, error: "Material markup must be 0 or more." };
  }
  if (!Number.isFinite(input.labor_markup_pct) || input.labor_markup_pct < 0) {
    return { ok: false, error: "Labor markup must be 0 or more." };
  }

  // Keep fixture lines and non-empty custom lines.
  const lines = input.lines.filter(
    (l) => l.fixture_id != null || l.description.trim() !== ""
  );
  if (lines.length === 0) {
    return { ok: false, error: "Add at least one fixture or custom line." };
  }
  for (const l of lines) {
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) {
      return { ok: false, error: "Every line needs a quantity greater than 0." };
    }
    if (l.fixture_id == null) {
      if (l.unit_price == null || !Number.isFinite(l.unit_price) || l.unit_price < 0) {
        return { ok: false, error: `Custom line "${l.description.trim()}" needs a price of 0 or more.` };
      }
    } else if (
      (l.material_markup_pct != null &&
        (!Number.isFinite(l.material_markup_pct) || l.material_markup_pct < 0)) ||
      (l.labor_markup_pct != null &&
        (!Number.isFinite(l.labor_markup_pct) || l.labor_markup_pct < 0))
    ) {
      return { ok: false, error: "A line markup override must be 0 or more." };
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
    material_markup_pct: input.material_markup_pct,
    labor_markup_pct: input.labor_markup_pct,
    notes: input.notes.trim(),
  };

  const erp = await erpSchema();

  const headerRes = input.id
    ? await erp.from("estimates").update(header).eq("id", input.id).select("id").single<{ id: string }>()
    : await erp.from("estimates").insert(header).select("id").single<{ id: string }>();

  if (headerRes.error) return { ok: false, error: headerRes.error.message };
  const estimateId = headerRes.data.id;

  if (input.id) {
    const del = await erp.from("estimate_lines").delete().eq("estimate_id", estimateId);
    if (del.error) return { ok: false, error: del.error.message };
  }

  const lineRows = lines.map((l, i) => {
    const isFixture = l.fixture_id != null;
    return {
      estimate_id: estimateId,
      fixture_id: l.fixture_id,
      material_id: null,
      description: isFixture ? "" : l.description.trim(), // fixture name resolved live in the view
      quantity: l.quantity,
      unit_price: isFixture ? null : l.unit_price,
      material_markup_pct: isFixture ? l.material_markup_pct : null,
      labor_markup_pct: isFixture ? l.labor_markup_pct : null,
      position: i,
    };
  });
  const linesRes = await erp.from("estimate_lines").insert(lineRows);
  if (linesRes.error) return { ok: false, error: linesRes.error.message };

  revalidatePath("/dashboard/estimates");
  return { ok: true, id: estimateId };
}

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireEstimateManager() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." as const };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>();
  if (!canManageEstimates(profile?.role)) return { error: "You don't have permission to manage estimates." as const };
  return { error: null };
}

// Lock the estimate's current pricing into a snapshot. Used for both the
// initial submit and later re-prices (label distinguishes them). Submit
// also advances the status to "sent".
async function lockEstimate(id: string, label: string, alsoSetSent: boolean): Promise<ActionResult> {
  const guard = await requireEstimateManager();
  if (guard.error) return { ok: false, error: guard.error };

  const erp = await erpSchema();
  const { error } = await erp.rpc("lock_estimate", { p_estimate_id: id, p_label: label });
  if (error) return { ok: false, error: error.message };

  if (alsoSetSent) {
    const upd = await erp.from("estimates").update({ status: "sent" }).eq("id", id);
    if (upd.error) return { ok: false, error: upd.error.message };
  }

  revalidatePath("/dashboard/estimates");
  revalidatePath(`/dashboard/estimates/${id}/edit`);
  return { ok: true };
}

export async function submitEstimate(id: string): Promise<ActionResult> {
  return lockEstimate(id, "Submitted", true);
}

export async function repriceEstimate(id: string): Promise<ActionResult> {
  return lockEstimate(id, "Re-price", false);
}

export async function unlockEstimate(id: string): Promise<ActionResult> {
  const guard = await requireEstimateManager();
  if (guard.error) return { ok: false, error: guard.error };

  const erp = await erpSchema();
  const { error } = await erp.from("estimates").update({ locked_snapshot_id: null }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/estimates");
  revalidatePath(`/dashboard/estimates/${id}/edit`);
  return { ok: true };
}
