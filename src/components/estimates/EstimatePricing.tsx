"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  submitEstimate,
  repriceEstimate,
  unlockEstimate,
  approveEstimate,
  rejectEstimate,
  reviseEstimate,
} from "@/app/dashboard/estimates/actions";
import type { EstimateSnapshot, EstimateSnapshotLine } from "@/lib/types/erp";

const currency = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD" });

// Shown under the editable form when an estimate is NOT locked.
export function SubmitEstimateButton({ estimateId }: { estimateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!confirm("Lock in the current pricing and mark this estimate as Sent?")) return;
    setBusy(true);
    setError(null);
    const res = await submitEstimate(estimateId);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-8 rounded border border-ink-border bg-ink-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-ink-text">Pricing is live</div>
          <div className="text-xs text-ink-muted">
            Submit to lock in the current prices — they&apos;ll be frozen so future material
            cost changes don&apos;t alter this estimate until you re-price.
          </div>
        </div>
        <button
          onClick={submit}
          disabled={busy}
          className="shrink-0 rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? "Submitting…" : "Submit & lock pricing"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-status-hold">{error}</p>}
    </div>
  );
}

// Shown instead of the editable form when an estimate IS locked, whether
// awaiting sign-off or already approved.
export function LockedEstimate({
  estimateId,
  snapshot,
  lines,
  previous,
  isApproved,
  approvedByName,
  approvedAt,
}: {
  estimateId: string;
  snapshot: EstimateSnapshot;
  lines: EstimateSnapshotLine[];
  previous: EstimateSnapshot | null;
  isApproved: boolean;
  approvedByName: string | null;
  approvedAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "reprice" | "unlock" | "approve" | "reject" | "revise">(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "reprice" | "unlock" | "approve" | "reject") {
    if (kind === "unlock" && !confirm("Unlock pricing? The estimate returns to live prices and becomes editable again.")) return;
    if (kind === "approve" && !confirm("Approve this estimate? Once approved it is locked for good — changing it later means creating a revision.")) return;
    if (kind === "reject" && !confirm("Reject this estimate? It goes back to Draft and a note recording the rejection is added.")) return;

    setBusy(kind);
    setError(null);
    const res =
      kind === "reprice" ? await repriceEstimate(estimateId)
      : kind === "unlock" ? await unlockEstimate(estimateId)
      : kind === "approve" ? await approveEstimate(estimateId)
      : await rejectEstimate(estimateId);

    if (!res.ok) {
      setError(res.error);
      setBusy(null);
      return;
    }
    router.refresh();
  }

  // Re-pricing an APPROVED estimate spawns a new draft revision rather
  // than rewriting a price that has been signed off.
  async function revise() {
    if (!confirm("Create a new draft revision with the same details? The approved estimate stays as it is.")) return;
    setBusy("revise");
    setError(null);
    const res = await reviseEstimate(estimateId);
    if (!res.ok) {
      setError(res.error);
      setBusy(null);
      return;
    }
    router.push(`/dashboard/estimates/${res.id}/edit`);
    router.refresh();
  }

  const delta = previous ? snapshot.total - previous.total : null;

  return (
    <div>
      <div
        className={`mb-4 rounded border p-4 ${
          isApproved ? "border-status-complete/40 bg-status-complete/10" : "border-accent/40 bg-accent-soft"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-ink-text">
              {isApproved ? "Approved — locked for good" : `Pricing locked — ${snapshot.label || "Snapshot"}`}
            </div>
            <div className="text-xs text-ink-muted">
              {isApproved ? (
                <>
                  Signed off by {approvedByName || "a user"}
                  {approvedAt && <> on {new Date(approvedAt).toLocaleString()}</>} · markup{" "}
                  {snapshot.material_markup_pct}% material / {snapshot.labor_markup_pct}% labor
                </>
              ) : (
                <>
                  Frozen {new Date(snapshot.created_at).toLocaleString()} · markup{" "}
                  {snapshot.material_markup_pct}% material / {snapshot.labor_markup_pct}% labor
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums text-ink-text">{currency(snapshot.total)}</div>
            {delta != null && (
              <div className={`text-xs tabular-nums ${delta > 0 ? "text-status-hold" : delta < 0 ? "text-status-complete" : "text-ink-muted"}`}>
                {delta === 0 ? "no change" : `${delta > 0 ? "+" : ""}${currency(delta)}`} vs previous ({currency(previous!.total)})
              </div>
            )}
          </div>
        </div>

        {isApproved ? (
          <div className="mt-3">
            <button
              onClick={revise}
              disabled={busy !== null}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {busy === "revise" ? "Creating revision…" : "Re-price as a new revision"}
            </button>
            <p className="mt-2 text-xs text-ink-muted">
              An approved estimate can&apos;t be edited. Re-pricing copies it into a new draft
              revision (same number with an -r2 suffix) and leaves this one untouched.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                onClick={() => run("approve")}
                disabled={busy !== null}
                className="rounded bg-status-complete px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {busy === "approve" ? "Approving…" : "Approve & sign off"}
              </button>
              <button
                onClick={() => run("reject")}
                disabled={busy !== null}
                className="rounded border border-status-hold px-3 py-1.5 text-sm font-medium text-status-hold disabled:opacity-60"
              >
                {busy === "reject" ? "Rejecting…" : "Reject"}
              </button>
              <button
                onClick={() => run("reprice")}
                disabled={busy !== null}
                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
              >
                {busy === "reprice" ? "Re-pricing…" : "Re-price from current costs"}
              </button>
              <button
                onClick={() => run("unlock")}
                disabled={busy !== null}
                className="rounded border border-ink-border px-3 py-1.5 text-sm text-ink-text disabled:opacity-60"
              >
                {busy === "unlock" ? "Unlocking…" : "Unlock & edit"}
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Approving records you as the signer with a timestamp and locks the estimate for
              good. Rejecting sends it back to Draft and adds a note saying who rejected it and
              when.
            </p>
          </>
        )}
        {error && <p className="mt-2 text-sm text-status-hold">{error}</p>}
      </div>

      <div className="overflow-x-auto rounded border border-ink-border bg-ink-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-ink-muted">
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Material cost</th>
              <th className="px-3 py-2 text-right">Labor cost</th>
              <th className="px-3 py-2 text-right">Unit price</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-ink-border last:border-0">
                <td className="px-3 py-2">
                  <span className="text-ink-text">{l.description || "—"}</span>
                  {l.sku && <span className="ml-2 font-mono text-xs text-ink-muted">{l.sku}</span>}
                  {l.kind === "custom" && <span className="ml-2 text-[10px] uppercase text-status-partial">non-stock</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                  {l.material_cost == null ? "—" : currency(l.material_cost)}
                  {l.material_cost != null && l.material_markup_pct != null && (
                    <span className="ml-1 text-xs">+{l.material_markup_pct}%</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                  {l.labor_cost == null ? "—" : currency(l.labor_cost)}
                  {l.labor_cost != null && l.labor_markup_pct != null && (
                    <span className="ml-1 text-xs">+{l.labor_markup_pct}%</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{currency(l.unit_price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{currency(l.line_total)}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ink-muted">
                  This snapshot has no lines.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-border">
              <td colSpan={5} className="px-3 py-2 text-right text-sm font-semibold text-ink-text">
                Locked total
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{currency(snapshot.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
