import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageEstimates } from "@/lib/auth/roles";
import { EstimateForm, type FixtureOption } from "@/components/estimates/EstimateForm";
import type { Estimate, EstimateLineDetail, Customer } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function EditEstimatePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  if (!canManageEstimates(profile?.role)) redirect("/dashboard/estimates");

  const erp = await erpSchema();
  const [estimateRes, linesRes, customersRes, fixturesRes] = await Promise.all([
    erp.from("estimates").select("*").eq("id", params.id).is("deleted_at", null).maybeSingle<Estimate>(),
    erp
      .from("estimate_line_details")
      .select("*")
      .eq("estimate_id", params.id)
      .order("position", { ascending: true })
      .returns<EstimateLineDetail[]>(),
    erp
      .from("customers")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<Pick<Customer, "id" | "name">[]>(),
    erp
      .from("assembly_costs")
      .select("assembly_id, name, assembly_number, unit_cost")
      .eq("is_fixture", true)
      .eq("active", true)
      .order("name", { ascending: true })
      .returns<FixtureOption[]>(),
  ]);

  const error = estimateRes.error || linesRes.error || customersRes.error || fixturesRes.error;
  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load estimate: {error.message}</p>;
  }
  if (!estimateRes.data) notFound();

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/estimates" className="text-sm text-ink-muted hover:underline">
          ← Estimates
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-text">
          Edit estimate{" "}
          <span className="font-mono text-sm text-ink-muted">{estimateRes.data.estimate_number}</span>
        </h1>
      </div>
      <EstimateForm
        customers={customersRes.data ?? []}
        fixtures={fixturesRes.data ?? []}
        estimate={estimateRes.data}
        lines={linesRes.data ?? []}
      />
    </div>
  );
}
