import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageOrders } from "@/lib/auth/roles";
import { CustomerForm } from "@/components/customers/CustomerForm";
import type { Brand } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function NewCustomerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  if (!canManageOrders(profile?.role)) redirect("/dashboard/customers");

  const erp = await erpSchema();
  const { data: brands, error } = await erp
    .from("brands")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .returns<Pick<Brand, "id" | "name">[]>();

  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load brands: {error.message}</p>;
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/customers" className="text-sm text-ink-muted hover:underline">
          ← Customers
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-text">New customer</h1>
      </div>
      <CustomerForm brands={brands ?? []} />
    </div>
  );
}
