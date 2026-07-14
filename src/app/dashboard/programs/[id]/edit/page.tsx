import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { erpSchema } from "@/lib/supabase/erp-client";
import { canManageCatalog } from "@/lib/auth/roles";
import { ProgramForm } from "@/components/programs/ProgramForm";
import type { Program, Brand } from "@/lib/types/erp";
import type { Profile } from "@/lib/types/shared";

export default async function EditProgramPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single<Pick<Profile, "role">>();

  if (!canManageCatalog(profile?.role)) redirect("/dashboard/programs");

  const erp = await erpSchema();
  const [programRes, brandsRes] = await Promise.all([
    erp.from("programs").select("*").eq("id", params.id).is("deleted_at", null).maybeSingle<Program>(),
    erp
      .from("brands")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .returns<Pick<Brand, "id" | "name">[]>(),
  ]);

  const error = programRes.error || brandsRes.error;
  if (error) {
    return <p className="text-sm text-status-hold">Couldn&apos;t load program: {error.message}</p>;
  }
  if (!programRes.data) notFound();

  return (
    <div>
      <div className="mb-4">
        <Link href="/dashboard/programs" className="text-sm text-ink-muted hover:underline">
          ← Programs
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-text">Edit program</h1>
      </div>
      <ProgramForm brands={brandsRes.data ?? []} program={programRes.data} />
    </div>
  );
}
