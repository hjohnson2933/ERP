// ERP-owned domain types, mirroring supabase/migrations/*.sql.
// These tables live in the `erp` Postgres schema, not `public`.

export interface Vendor {
  id: string;
  name: string;
  notes: string;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: string;
  sku: string;
  name: string;
  description: string;
  notes: string;
  unit_of_measure: string;
  category: string;
  default_unit_cost: number | null;
  reorder_point: number | null;
  default_location_id: string | null; // soft ref to erp.locations
  default_vendor_id: string | null;   // soft ref to erp.vendors
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Shape of the erp.material_stock_summary view.
// on_hold, committed, on_order are stubs (0) until backing tables exist.
// available = in_stock - on_hold - committed once those are real.
// UI gates on_hold and committed behind canViewStockReservations() in roles.ts.
export interface MaterialStockSummary {
  material_id: string;
  sku: string;
  name: string;
  description: string;
  notes: string;
  category: string;
  unit_of_measure: string;
  default_unit_cost: number | null;
  reorder_point: number | null;
  default_location_id: string | null;
  default_vendor_id: string | null;
  in_stock: number;
  on_hold: number;
  committed: number;
  on_order: number;
  available: number;
}

export interface StockLevel {
  material_id: string;
  location_id: string;
  quantity: number;
  updated_at: string;
}

export type MovementType = "receipt" | "issue" | "adjustment" | "transfer_out" | "transfer_in";

export interface StockMovement {
  id: string;
  material_id: string;
  location_id: string;
  movement_type: MovementType;
  quantity: number;
  job_id: string | null;
  transfer_group_id: string | null;
  note: string;
  created_by: string | null;
  created_at: string;
}

// ─── Sales flow: brands → order forms → dealerships → orders ────

export interface Brand {
  id: string;
  name: string;
  notes: string;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// Customers are dealerships tied to a brand.
export interface Customer {
  id: string;
  brand_id: string;
  name: string;
  bill_to_address: string;
  ship_to_street: string;
  ship_to_city: string;
  ship_to_state: string;
  ship_to_zip: string;
  phone: string;
  email: string;
  fax: string;
  notes: string;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// The approved, priced catalog for a brand.
export interface OrderForm {
  id: string;
  brand_id: string;
  name: string;
  effective_date: string | null;
  expiration_date: string | null;
  approved: boolean;
  notes: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderFormItem {
  id: string;
  order_form_id: string;
  part_number: string;  // Fixture Number
  component: string;    // description incl. finish, size, etc.
  photo_path: string;   // Supabase Storage path
  sales_price: number;
  position: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | "order_received"
  | "pre_production"
  | "ready_for_production_review"
  | "ready_for_production"
  | "in_production"
  | "ok_to_ship"
  | "shipped"
  | "installation_complete"
  | "invoicing_complete"
  | "job_complete";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  order_received: "Order Received",
  pre_production: "Pre-Production",
  ready_for_production_review: "Ready for Production Review",
  ready_for_production: "Ready for Production",
  in_production: "In Production",
  ok_to_ship: "OK to Ship (OKTS)",
  shipped: "Shipped / En-Route",
  installation_complete: "Installation Complete",
  invoicing_complete: "Invoicing Complete",
  job_complete: "Job Complete",
};

export interface Order {
  id: string;
  order_number: string;            // generated: 1 letter + 5 digits
  customer_id: string;
  order_form_id: string;
  status: OrderStatus;
  authorizing_individual: string;
  bill_to_address: string;
  ship_to_street: string;
  ship_to_city: string;
  ship_to_state: string;
  ship_to_zip: string;
  phone: string;
  email: string;
  fax: string;
  job_id: string | null;           // soft ref to public.jobs.id; many orders may share one job
  notes: string;
  created_by: string | null;       // soft ref to public.profiles.id
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderLine {
  id: string;
  order_id: string;
  order_form_item_id: string | null;
  part_number: string;             // snapshot at order time
  component: string;               // snapshot at order time
  quantity: number;
  unit_price: number;              // snapshot of sales_price at order time
  line_total: number;              // generated: quantity * unit_price
  position: number;
  created_at: string;
  updated_at: string;
}

// ─── Product catalog: programs → fixtures/assemblies → BOM ─────
// A program is a brand's set of active fixtures. A fixture is a finished
// assembly. An assembly is built from a bill of materials of parts
// (erp.materials) and/or child assemblies (sub-assemblies).

export interface Program {
  id: string;
  brand_id: string;
  name: string;
  active: boolean;
  notes: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assembly {
  id: string;
  name: string;
  assembly_number: string | null;
  is_fixture: boolean;
  program_id: string | null;   // set only when is_fixture (one program per fixture)
  description: string;
  photo_path: string;
  active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// One BOM line: either a material (part) or a child assembly (sub-assembly).
export interface AssemblyComponent {
  id: string;
  parent_assembly_id: string;
  material_id: string | null;
  child_assembly_id: string | null;
  quantity: number;
  unit_cost_override: number | null; // NULL => use the standard material/roll-up cost
  position: number;
  created_at: string;
  updated_at: string;
}

// Shape of the erp.assembly_costs view: an assembly with its current
// rolled-up material cost.
export interface AssemblyCost {
  assembly_id: string;
  name: string;
  assembly_number: string | null;
  is_fixture: boolean;
  program_id: string | null;
  active: boolean;
  unit_cost: number;
}

// ─── Estimates (quoting) ───────────────────────────────────────
// An estimate is the priced quote that precedes an order. Lines are
// free-form for custom furniture work, optionally referencing a catalog
// item. When accepted, an estimate converts into an erp.orders row and
// records the link via order_id.

export type EstimateStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired";

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
};

export interface Estimate {
  id: string;
  estimate_number: string;         // generated: 'E' + digits (E00001)
  status: EstimateStatus;
  title: string;                   // project / description
  customer_id: string | null;      // nullable FK to erp.customers (prospects allowed)
  customer_name: string;           // snapshot / prospect name
  contact_email: string;
  contact_phone: string;
  valid_until: string | null;
  job_id: string | null;           // soft ref to public.jobs.id
  order_id: string | null;         // set when converted to an order
  markup_pct: number;              // estimate-wide default markup % on fixture cost
  notes: string;
  created_by: string | null;       // soft ref to public.profiles.id
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EstimateLine {
  id: string;
  estimate_id: string;
  order_form_item_id: string | null; // optional catalog reference
  material_id: string | null;        // legacy: pulled from erp.materials (live price)
  fixture_id: string | null;         // set => a fixture (price = rolled-up cost × markup)
  description: string;
  quantity: number;
  unit_price: number | null;         // custom sell price; NULL for fixture/material lines
  unit_cost: number | null;          // optional, for margin
  markup_pct: number | null;         // per-line markup override (fixtures); NULL => inherit estimate default
  position: number;
  created_at: string;
  updated_at: string;
}

export type EstimateLineKind = "fixture" | "material" | "custom";

// Shape of the erp.estimate_line_details view: estimate lines with the
// effective sell price (fixtures priced at rolled-up cost × markup) and
// computed total.
export interface EstimateLineDetail {
  id: string;
  estimate_id: string;
  fixture_id: string | null;
  material_id: string | null;
  kind: EstimateLineKind;
  is_custom: boolean;
  description: string;
  sku: string | null;
  quantity: number;
  unit_price: number;        // effective sell price
  unit_cost: number | null;  // underlying cost (fixtures/materials); null for custom
  markup_pct: number | null; // effective markup applied (fixtures only)
  markup_override: number | null; // raw per-line override (null => inherits estimate default)
  line_total: number;        // quantity * unit_price
  position: number;
  created_at: string;
  updated_at: string;
}
