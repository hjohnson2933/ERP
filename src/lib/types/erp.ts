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

// Estimates still pending real exports from ProjectPAK.
// export interface Estimate { ... }
