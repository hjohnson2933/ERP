import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/nav/Sidebar";
import { TopBar } from "@/components/nav/TopBar";
import type { Profile } from "@/lib/types/shared";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, initials, role, active, created_at")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile || !profile.active) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={profile.role} name={profile.full_name} initials={profile.initials} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-ink-bg p-8">{children}</main>
      </div>
    </div>
  );
}
