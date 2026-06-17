import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/nav/Sidebar";
import type { Profile } from "@/lib/types/shared";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Same `profiles` table the mill list reads — one identity, one role,
  // shared across both apps.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, initials, role, active, created_at")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile || !profile.active) redirect("/login");

  return (
    <div className="flex">
      <Sidebar role={profile.role} />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
