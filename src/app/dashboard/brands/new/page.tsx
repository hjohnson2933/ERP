import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canManageOrders } from "@/lib/auth/roles";
import { BrandForm } from "@/components/brands/BrandForm";
import type { Profile } from "@/lib/types/shared";

export default async function NewBrandPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  if (!canManageOrders(profile?.role)) redirect("/dashboard/brands");

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/brands" className="text-sm text-ink-muted hover:underline">
          ← Brands
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-text">New brand</h1>
      </div>
      <BrandForm />
    </div>
  );
}
