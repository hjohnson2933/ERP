"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ERP_TAB_LABELS } from "@/lib/auth/roles";

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  // /dashboard/customers/new -> "customers" -> "Customers"; /dashboard -> "Dashboard"
  const segment = pathname.split("/")[2];
  const title = segment ? ERP_TAB_LABELS[segment] ?? "Dashboard" : "Dashboard";

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center justify-between bg-nav px-6 text-white">
      <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
      <button
        onClick={signOut}
        disabled={signingOut}
        className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-nav-muted hover:bg-white/5 hover:text-white disabled:opacity-60"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </header>
  );
}
