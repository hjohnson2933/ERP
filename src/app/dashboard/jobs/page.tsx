import { createClient } from "@/lib/supabase/server";
import type { Job } from "@/lib/types/shared";

const STATUS_DOT: Record<Job["status"], string> = {
  hold: "bg-status-hold",
  partial: "bg-status-partial",
  approval: "bg-status-approval",
  ready: "bg-status-ready",
  inmill: "bg-status-inmill",
  complete: "bg-status-complete",
};

// Read-only for now: the ERP observes mill list jobs, it doesn't own
// them. Write access (e.g. creating a job from a won estimate) is a
// deliberate later step, not implied by this scaffold.
export default async function JobsPage() {
  const supabase = createClient();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, job_number, client, title, install_date, status, assigned_to, created_at, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(50)
    .returns<Job[]>();

  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load jobs: {error.message}</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-ink-text">Jobs</h1>
      <div className="overflow-hidden rounded border border-ink-border bg-ink-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-border text-left text-ink-muted">
              <th className="px-3 py-2">Job #</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Install date</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {jobs?.map((job) => (
              <tr key={job.id} className="border-b border-ink-border last:border-0">
                <td className="px-3 py-2">{job.job_number}</td>
                <td className="px-3 py-2">{job.client}</td>
                <td className="px-3 py-2">{job.title}</td>
                <td className="px-3 py-2">{job.install_date ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[job.status]}`} />
                    {job.status}
                  </span>
                </td>
              </tr>
            ))}
            {jobs?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                  No jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
