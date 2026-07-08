-- ════════════════════════════════════════════════════════════════
-- ERP — sales flow model
-- brands → order forms (approved priced catalogs) → dealerships →
-- orders → order lines. Orders are the job-creation trigger; the
-- job_id soft reference points at public.jobs (many orders may share
-- one job for phased production). The ERP does NOT write to
-- public.jobs yet — that handoff comes with a later migration and a
-- coordinated RLS conversation with the mill list owner.
--
-- Run after 00001–00004.
-- ════════════════════════════════════════════════════════════════

-- ─── Order lifecycle ───────────────────────────────────────────
create type erp.order_status as enum (
  'order_received',
  'pre_production',
  'ready_for_production_review',
  'ready_for_production',
  'in_production',
  'ok_to_ship',
  'shipped',
  'installation_complete',
  'invoicing_complete',
  'job_complete'
);

-- ─── Brands / Programs ─────────────────────────────────────────
create table erp.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text not null default '',
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger brands_set_updated_at
  before update on erp.brands
  for each row execute function public.set_updated_at();

-- ─── Customers (Dealerships) ───────────────────────────────────
-- Customers are dealerships tied to a brand; they order from that
-- brand's approved catalog. Fields will be refined against a Sage
-- export later; this covers what the order workflow needs now.
create table erp.customers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references erp.brands(id),
  name text not null,                    -- Dealership Name
  bill_to_address text not null default '',
  ship_to_street text not null default '',
  ship_to_city text not null default '',
  ship_to_state text not null default '',
  ship_to_zip text not null default '',
  phone text not null default '',
  email text not null default '',
  fax text not null default '',
  notes text not null default '',
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_brand_id_idx on erp.customers(brand_id);

create trigger customers_set_updated_at
  before update on erp.customers
  for each row execute function public.set_updated_at();

-- ─── Order Forms (approved priced catalogs) ────────────────────
-- One per brand/program (a brand may have several over time).
-- Generic structure for now; layout formatting to match the
-- company's current order form document comes later.
create table erp.order_forms (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references erp.brands(id),
  name text not null,                    -- e.g. "2026 Retail Program"
  effective_date date,
  expiration_date date,
  approved boolean not null default false,
  notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_forms_brand_id_idx on erp.order_forms(brand_id);

create trigger order_forms_set_updated_at
  before update on erp.order_forms
  for each row execute function public.set_updated_at();

-- ─── Order Form Items (the catalog) ────────────────────────────
create table erp.order_form_items (
  id uuid primary key default gen_random_uuid(),
  order_form_id uuid not null references erp.order_forms(id) on delete cascade,
  part_number text not null,             -- Fixture Number
  component text not null,               -- description incl. finish, size, etc.
  photo_path text not null default '',   -- Supabase Storage path for the item photo
  sales_price numeric(12,2) not null,
  position double precision not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_form_items_form_idx on erp.order_form_items(order_form_id);
create unique index order_form_items_part_per_form
  on erp.order_form_items(order_form_id, part_number)
  where deleted_at is null;

create trigger order_form_items_set_updated_at
  before update on erp.order_form_items
  for each row execute function public.set_updated_at();

-- ─── Order number generation ───────────────────────────────────
-- Format: 1 letter + 5 digits (A00001 … A99999, then B00001, …).
-- Backed by a plain sequence; letter advances every 99,999 numbers.
create sequence erp.order_number_seq;

create or replace function erp.next_order_number()
returns text
language plpgsql
as $$
declare
  n bigint;
  letter_idx int;
  digits int;
begin
  n := nextval('erp.order_number_seq');           -- 1, 2, 3, …
  letter_idx := ((n - 1) / 99999)::int;            -- 0 = A, 1 = B, …
  digits := ((n - 1) % 99999)::int + 1;            -- 1 … 99999
  if letter_idx > 25 then
    raise exception 'Order number space exhausted (past Z99999)';
  end if;
  return chr(65 + letter_idx) || lpad(digits::text, 5, '0');
end;
$$;

-- ─── Orders ────────────────────────────────────────────────────
-- Placed by a dealership against an approved order form; created by
-- the PM (for now). The header fields snapshot dealership contact
-- info AS OF the order, since dealership records change over time
-- but a placed order's paperwork shouldn't.
create table erp.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default erp.next_order_number(),
  customer_id uuid not null references erp.customers(id),
  order_form_id uuid not null references erp.order_forms(id),
  status erp.order_status not null default 'order_received',

  -- Header snapshot (from the order form document)
  authorizing_individual text not null default '',
  bill_to_address text not null default '',
  ship_to_street text not null default '',
  ship_to_city text not null default '',
  ship_to_state text not null default '',
  ship_to_zip text not null default '',
  phone text not null default '',
  email text not null default '',
  fax text not null default '',

  -- SOFT reference to public.jobs.id — no FK by design. Many phased
  -- orders may share one job. NULL until the job exists.
  job_id uuid,

  notes text not null default '',
  created_by uuid,                        -- soft ref to public.profiles.id
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_customer_idx on erp.orders(customer_id);
create index orders_job_id_idx on erp.orders(job_id) where job_id is not null;
create index orders_status_idx on erp.orders(status);

create trigger orders_set_updated_at
  before update on erp.orders
  for each row execute function public.set_updated_at();

-- ─── Order Lines ───────────────────────────────────────────────
-- unit_price is SNAPSHOTTED from the catalog item at order time; a
-- later catalog price change must never alter an existing order.
-- line_total is computed, never stored out of sync.
create table erp.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references erp.orders(id) on delete cascade,
  order_form_item_id uuid references erp.order_form_items(id),
  part_number text not null,              -- snapshot
  component text not null,                -- snapshot
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,      -- snapshot of sales_price
  line_total numeric(14,2) generated always as (quantity * unit_price) stored,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_lines_order_idx on erp.order_lines(order_id);

create trigger order_lines_set_updated_at
  before update on erp.order_lines
  for each row execute function public.set_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────
-- Orders are created by the PM for now; admin included as always.
-- Wider read for any authenticated role, consistent with the rest
-- of the suite.
create or replace function erp.can_manage_orders()
returns boolean
language sql stable
as $$
  select public.my_role() in ('admin', 'pm');
$$;

alter table erp.brands           enable row level security;
alter table erp.customers        enable row level security;
alter table erp.order_forms      enable row level security;
alter table erp.order_form_items enable row level security;
alter table erp.orders           enable row level security;
alter table erp.order_lines      enable row level security;

create policy brands_read  on erp.brands for select using (public.my_role() is not null);
create policy brands_write on erp.brands for all    using (public.is_editor());

create policy customers_read  on erp.customers for select using (public.my_role() is not null);
create policy customers_write on erp.customers for all    using (erp.can_manage_orders());

create policy order_forms_read  on erp.order_forms for select using (public.my_role() is not null);
create policy order_forms_write on erp.order_forms for all    using (public.is_editor());

create policy order_form_items_read  on erp.order_form_items for select using (public.my_role() is not null);
create policy order_form_items_write on erp.order_form_items for all    using (public.is_editor());

create policy orders_read  on erp.orders for select using (public.my_role() is not null);
create policy orders_write on erp.orders for all    using (erp.can_manage_orders());

create policy order_lines_read  on erp.order_lines for select using (public.my_role() is not null);
create policy order_lines_write on erp.order_lines for all    using (erp.can_manage_orders());
