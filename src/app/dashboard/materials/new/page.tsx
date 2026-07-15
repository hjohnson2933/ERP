import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canManageMaterials } from "@/lib/auth/roles";
import { MaterialForm } from "@/components/materials/MaterialForm";
import type { Profile } from "@/lib/types/shared";

export default async function NewMaterialPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  if (!canManageMaterials(profile?.role)) redirect("/dashboard/materials");

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/materials" className="text-sm text-ink-muted hover:underline">
          ← Materials
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-text">New material</h1>
      </div>
      <MaterialForm />
    </div>
  );
}
