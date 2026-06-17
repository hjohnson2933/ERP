import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-ink-text">Dashboard</h1>
      <p className="text-sm text-ink-muted">Signed in as {user?.email}</p>
    </div>
  );
}
