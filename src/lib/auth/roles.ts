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

// Mirrors mill list isEditorRole() exactly.
export const isEditorRole = (r: Role | null | undefined) =>
  r === "admin" ||
  r === "pm" ||
  r === "prog" ||
  r === "cnc" ||
  r === "foreman" ||
  r === "cnc_manager";

// Who can see On Hold and Committed stock quantities.
// UI-level gate — add roles here as access needs grow, no DB migration needed.
export const canViewStockReservations = (r: Role | null | undefined) =>
  r === "admin" ||
  r === "pm" ||
  r === "foreman" ||
  r === "cnc_manager";

// Who can create and manage orders (dealership orders against an
// approved order form). PM-owned for now, per current workflow.
// Mirrors erp.can_manage_orders() in the database — keep in sync.
export const canManageOrders = (r: Role | null | undefined) =>
  r === "admin" || r === "pm";

// Who can create and manage estimates (priced quotes that precede an
// order). Same roles as orders for now, per ERP_ROLE_TABS. Mirrors
// erp.can_manage_estimates() in the database — keep in sync.
export const canManageEstimates = (r: Role | null | undefined) =>
  r === "admin" || r === "pm";

// Who can manage the product catalog: programs, assemblies, and fixtures
// (the building blocks estimates draw from). Mirrors
// erp.can_manage_catalog() in the database — keep in sync.
export const canManageCatalog = (r: Role | null | undefined) =>
  r === "admin" || r === "pm";

// Who can view/manage materials. Mirrors erp.can_view_materials() (which
// backs the materials read/write RLS) — keep in sync.
export const canManageMaterials = (r: Role | null | undefined) =>
  r === "admin" || r === "pm" || r === "foreman" || r === "cnc_manager";

export const ERP_ROLE_TABS: Record<Role, string[]> = {
  admin: ["dashboard", "jobs", "orders", "brands", "programs", "assemblies", "customers", "estimates", "materials"],
  pm: ["dashboard", "jobs", "orders", "brands", "programs", "assemblies", "customers", "estimates", "materials"],
  prog: ["dashboard", "jobs"],
  cnc: ["dashboard", "jobs"],
  carpenter: ["dashboard"],
  installer: ["dashboard"],
  foreman: ["dashboard", "jobs", "materials"],
  cnc_manager: ["dashboard", "jobs", "materials"],
};

export const ERP_TAB_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  jobs: "Jobs",
  orders: "Orders",
  brands: "Brands",
  programs: "Programs",
  assemblies: "Assemblies",
  customers: "Customers",
  estimates: "Estimates",
  materials: "Materials",
};
