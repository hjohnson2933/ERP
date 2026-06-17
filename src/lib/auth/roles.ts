// Mirrors the mill list app's types.ts Role union exactly. Both apps read
// the same `profiles.role` column and the same `user_role` Postgres enum —
// if a role is added there (see migration 00008), add it here too.
export type Role =
  | "admin"
  | "pm"
  | "prog"
  | "cnc"
  | "carpenter"
  | "installer"
  | "foreman"
  | "cnc_manager";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin / Management",
  pm: "Project Manager",
  prog: "Programming",
  cnc: "CNC Operator",
  carpenter: "Carpenter",
  installer: "Installer",
  foreman: "Shop Foreman",
  cnc_manager: "CNC Manager",
};

// Mirrors mill list isEditorRole() — same definition of "can write
// production data" used by the database's is_editor() RLS function.
export const isEditorRole = (r: Role | null | undefined) =>
  r === "admin" ||
  r === "pm" ||
  r === "prog" ||
  r === "cnc" ||
  r === "foreman" ||
  r === "cnc_manager";

// ERP-specific tabs by role. Until accounting/estimating-specific roles
// exist, every editor-tier role sees the full ERP nav; refine this once
// real usage patterns emerge (e.g. a future "accounting" role that should
// NOT see programming-only tabs).
export const ERP_ROLE_TABS: Record<Role, string[]> = {
  admin: ["dashboard", "jobs", "customers", "estimates", "materials"],
  pm: ["dashboard", "jobs", "customers", "estimates", "materials"],
  prog: ["dashboard", "jobs"],
  cnc: ["dashboard", "jobs"],
  carpenter: ["dashboard"],
  installer: ["dashboard"],
  foreman: ["dashboard", "jobs"],
  cnc_manager: ["dashboard", "jobs"],
};

export const ERP_TAB_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  jobs: "Jobs",
  customers: "Customers",
  estimates: "Estimates",
  materials: "Materials",
};
