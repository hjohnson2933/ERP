import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageEstimates } from "@/lib/auth/roles";
import { EstimateForm, type FixtureOption } from "@/components/estimates/EstimateForm";
import { SubmitEstimateButton, LockedEstimate } from "@/components/estimates/EstimatePricing";
import type {
  Estimate,
  EstimateLineDetail,
  EstimateSnapshot,
  EstimateSnapshotLine,
  Customer,
} from "@/lib/types/erp";
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
  const { data: estimate, error: estimateErr } = await erp
    .from("estimates")
    .select("*")
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle<Estimate>();

  if (estimateErr) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load estimate: {estimateErr.message}</p>;
  }
  if (!estimate) notFound();

  const header = (
    <div className="mb-4">
      <Link href="/dashboard/estimates" className="text-sm text-ink-muted hover:underline">
        ← Estimates
      </Link>
      <h1 className="mt-1 text-xl font-semibold text-ink-text">
        {estimate.locked_snapshot_id ? "Estimate" : "Edit estimate"}{" "}
        <span className="font-mono text-sm text-ink-muted">{estimate.estimate_number}</span>
        {estimate.revision_number > 1 && (
          <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
            Revision {estimate.revision_number}
          </span>
        )}
      </h1>
      {estimate.revision_of && (
        <Link
          href={`/dashboard/estimates/${estimate.revision_of}/edit`}
          className="text-xs text-ink-muted hover:underline"
        >
          ← revision of the original estimate
        </Link>
      )}
    </div>
  );

  // Locked: show the frozen snapshot (read-only) with re-price / unlock.
  if (estimate.locked_snapshot_id) {
    const [snapshotsRes, snapLinesRes] = await Promise.all([
      erp
        .from("estimate_snapshots")
        .select("*")
        .eq("estimate_id", params.id)
        .order("created_at", { ascending: false })
        .limit(2)
        .returns<EstimateSnapshot[]>(),
      erp
        .from("estimate_snapshot_lines")
        .select("*")
        .eq("snapshot_id", estimate.locked_snapshot_id)
        .order("position", { ascending: true })
        .returns<EstimateSnapshotLine[]>(),
    ]);

    const error = snapshotsRes.error || snapLinesRes.error;
    if (error) {
      return <p className="text-sm text-status-hold">Couldn&apos;t load snapshot: {error.message}</p>;
    }

    const snapshots = snapshotsRes.data ?? [];
    const current = snapshots.find((s) => s.id === estimate.locked_snapshot_id) ?? snapshots[0];
    const previous = snapshots.find((s) => s.id !== current?.id) ?? null;

    // Resolve the signer's name for the approval banner. Lives in the
    // mill list's public.profiles, so it is a separate read.
    let approvedByName: string | null = null;
    if (estimate.approved_by) {
      const { data: approver } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", estimate.approved_by)
        .maybeSingle<Pick<Profile, "full_name">>();
      approvedByName = approver?.full_name ?? null;
    }

    return (
      <div>
        {header}
        {current && (
          <LockedEstimate
            estimateId={estimate.id}
            snapshot={current}
            lines={snapLinesRes.data ?? []}
            previous={previous}
            isApproved={estimate.status === "approved"}
            approvedByName={approvedByName}
            approvedAt={estimate.approved_at}
          />
        )}
      </div>
    );
  }

  // Live: editable builder + submit-to-lock control.
  const [linesRes, customersRes, fixturesRes] = await Promise.all([
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
      .select("assembly_id, name, assembly_number, material_cost, labor_cost")
      .eq("is_fixture", true)
      .eq("active", true)
      .order("name", { ascending: true })
      .returns<FixtureOption[]>(),
  ]);

  const error = linesRes.error || customersRes.error || fixturesRes.error;
  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load estimate: {error.message}</p>;
  }

  return (
    <div>
      {header}
      <EstimateForm
        customers={customersRes.data ?? []}
        fixtures={fixturesRes.data ?? []}
        estimate={estimate}
        lines={linesRes.data ?? []}
      />
      <SubmitEstimateButton estimateId={estimate.id} />
    </div>
  );
}
