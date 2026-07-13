"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/auth/roles";
import { ERP_ROLE_TABS, ERP_TAB_LABELS, ROLE_LABELS } from "@/lib/auth/roles";

function hrefFor(tab: string) {
  return tab === "dashboard" ? "/dashboard" : `/dashboard/${tab}`;
}

export function Sidebar({
  role,
  name,
  initials,
}: {
  role: Role;
  name: string;
  initials: string;
}) {
  const pathname = usePathname();
  const tabs = ERP_ROLE_TABS[role] ?? [];

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex h-screen w-56 flex-col bg-nav text-white">
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
          II
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Ideal Image</div>
          <div className="text-xs text-nav-muted">ERP</div>
        </div>
      </div>

      {/* Nav */}
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-4">
        {tabs.map((tab) => {
          const href = hrefFor(tab);
          const active = isActive(href);
          return (
            <li key={tab}>
              <Link
                href={href}
                className={
                  active
                    ? "block rounded-md border-l-[3px] border-accent bg-white px-3 py-2 text-sm font-medium text-ink-text"
                    : "block rounded-md border-l-[3px] border-transparent px-3 py-2 text-sm text-nav-muted hover:bg-white/5 hover:text-white"
                }
              >
                {ERP_TAB_LABELS[tab] ?? tab}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* User */}
      <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
          {initials || "?"}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-medium text-white">{name}</div>
          <div className="truncate text-xs text-nav-muted">{ROLE_LABELS[role]}</div>
        </div>
      </div>
    </nav>
  );
}
