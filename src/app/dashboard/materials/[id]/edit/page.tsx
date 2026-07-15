import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageMaterials } from "@/lib/auth/roles";
import { MaterialForm } from "@/components/materials/MaterialForm";
import type { Material } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function EditMaterialPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  if (!canManageMaterials(profile?.role)) redirect("/dashboard/materials");

  const erp = await erpSchema();
  const { data: material, error } = await erp
    .from("materials")
    .select("*")
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle<Material>();

  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load material: {error.message}</p>;
  }
  if (!material) notFound();

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/materials" className="text-sm text-ink-muted hover:underline">
          ← Materials
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-text">
          Edit material <span className="font-mono text-sm text-ink-muted">{material.sku}</span>
        </h1>
      </div>
      <MaterialForm material={material} />
    </div>
  );
}
