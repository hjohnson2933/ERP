import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageOrders } from "@/lib/auth/roles";
import { CustomerForm } from "@/components/customers/CustomerForm";
import type { Customer, Brand } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function EditCustomerPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  if (!canManageOrders(profile?.role)) redirect("/dashboard/customers");

  const erp = await erpSchema();
  const [customerRes, brandsRes] = await Promise.all([
    erp
      .from("customers")
      .select("*")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle<Customer>(),
    erp
      .from("brands")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<Pick<Brand, "id" | "name">[]>(),
  ]);

  const error = customerRes.error || brandsRes.error;
  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load customer: {error.message}</p>;
  }
  if (!customerRes.data) notFound();

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/customers" className="text-sm text-ink-muted hover:underline">
          ← Customers
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-text">Edit customer</h1>
      </div>
      <CustomerForm brands={brandsRes.data ?? []} customer={customerRes.data} />
    </div>
  );
}
