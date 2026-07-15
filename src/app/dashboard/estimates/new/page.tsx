import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageEstimates } from "@/lib/auth/roles";
import { EstimateForm, type FixtureOption } from "@/components/estimates/EstimateForm";
import type { Customer } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function NewEstimatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  if (!canManageEstimates(profile?.role)) redirect("/dashboard/estimates");

  const erp = await erpSchema();
  const [customersRes, fixturesRes] = await Promise.all([
    erp
      .from("customers")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<Pick<Customer, "id" | "name">[]>(),
    erp
      .from("assembly_costs")
      .select("assembly_id, name, assembly_number, material_cost, labor_cost")
      .eq("is_fixture", true)
      .eq("active", true)
      .order("name", { ascending: true })
      .returns<FixtureOption[]>(),
  ]);

  const error = customersRes.error || fixturesRes.error;
  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load data: {error.message}</p>;
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/estimates" className="text-sm text-ink-muted hover:underline">
          ← Estimates
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-text">New estimate</h1>
      </div>
      <EstimateForm customers={customersRes.data ?? []} fixtures={fixturesRes.data ?? []} />
    </div>
  );
}
