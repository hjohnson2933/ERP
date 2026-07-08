import Link from "next/link";
import type { Role } from "@/lib/auth/roles";
import { ERP_ROLE_TABS, ERP_TAB_LABELS } from "@/lib/auth/roles";

export function Sidebar({ role }: { role: Role }) {
  const tabs = ERP_ROLE_TABS[role] ?? [];

  return (
    <nav className="flex h-screen w-48 flex-col border-r border-ink-border bg-ink-surface px-3 py-6">
      <div className="mb-6 px-2 text-sm font-semibold text-ink-text">ERP</div>
      <ul className="flex flex-col gap-1">
        {tabs.map((tab) => (
          <li key={tab}>
            <Link
              href={tab === "dashboard" ? "/dashboard" : `/dashboard/${tab}`}
              className="block rounded px-2 py-1.5 text-sm text-ink-text hover:bg-ink-bg"
            >
              {ERP_TAB_LABELS[tab] ?? tab}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
