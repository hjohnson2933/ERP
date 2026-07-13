import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageOrders } from "@/lib/auth/roles";
import { BrandForm } from "@/components/brands/BrandForm";
import type { Brand } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function EditBrandPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  if (!canManageOrders(profile?.role)) redirect("/dashboard/brands");

  const erp = await erpSchema();
  const { data: brand, error } = await erp
    .from("brands")
    .select("*")
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle<Brand>();

  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load brand: {error.message}</p>;
  }
  if (!brand) notFound();

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/brands" className="text-sm text-ink-muted hover:underline">
          ← Brands
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-text">Edit brand</h1>
      </div>
      <BrandForm brand={brand} />
    </div>
  );
}
