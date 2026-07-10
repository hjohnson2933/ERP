-- ════════════════════════════════════════════════════════════════
-- ERP — estimates (quoting) module
--
-- An estimate is the priced quote that PRECEDES an order. For custom
-- furniture work the quote is usually typed in line by line rather than
-- pulled from an approved dealer catalog, so estimate_lines are
-- free-form (description + qty + price) with an OPTIONAL soft link back
-- to an erp.order_form_items catalog row when a line does come from one.
--
-- Lifecycle: draft → sent → accepted → rejected → expired. When an
-- estimate is accepted it converts into an erp.orders row; the soft
-- order_id back-reference records that link (no cross-table FK enforced
-- on it beyond the nullable FK below, kept nullable so an estimate can
-- exist long before any order does).
--
-- ProjectPAK-specific import fields are intentionally NOT modeled yet —
-- the same reasoning that deferred iPOL columns on erp.materials. This
-- covers what the quoting workflow needs now from the ERP's own sales
-- model; a later migration can add import columns without reshaping this.
--
-- Run after 00001–00006.
-- ════════════════════════════════════════════════════════════════

-- ─── Estimate lifecycle ────────────────────────────────────────
create type erp.estimate_status as enum (
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired'
);

-- ─── Estimate number generation ────────────────────────────────
-- Format: 'E' + zero-padded count (E00001, E00002, …). Distinct from
-- the order-number space (A00001…) so the two are never confused. Uses
-- lpad, so it simply grows past 5 digits rather than exhausting.
create sequence erp.estimate_number_seq;

create or replace function erp.next_estimate_number()
returns text
language plpgsql
as $$
begin
  return 'E' || lpad(nextval('erp.estimate_number_seq')::text, 5, '0');
end;
$$;

-- ─── Estimates ─────────────────────────────────────────────────
-- customer_id is a nullable FK to erp.customers: an estimate may be for
-- a prospect who is not yet a customer, so contact info is also snapshot
-- on the header (like erp.orders snapshots dealership contact info).
create table erp.estimates (
  id uuid primary key default gen_random_uuid(),
  estimate_number text not null unique default erp.next_estimate_number(),
  status erp.estimate_status not null default 'draft',

  title text not null default '',           -- project / description
  customer_id uuid references erp.customers(id),
  customer_name text not null default '',    -- snapshot / prospect name
  contact_email text not null default '',
  contact_phone text not null default '',

  valid_until date,

  -- SOFT reference to public.jobs.id — no FK by design, matches orders.
  job_id uuid,
  -- Set when the estimate is converted into an order.
  order_id uuid references erp.orders(id),

  notes text not null default '',
  created_by uuid,                           -- soft ref to public.profiles.id
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index estimates_customer_idx on erp.estimates(customer_id) where customer_id is not null;
create index estimates_status_idx on erp.estimates(status);
create index estimates_order_id_idx on erp.estimates(order_id) where order_id is not null;

create trigger estimates_set_updated_at
  before update on erp.estimates
  for each row execute function public.set_updated_at();

-- ─── Estimate lines ────────────────────────────────────────────
-- Free-form by default; order_form_item_id optionally records that a
-- line was pulled from the catalog. quantity is numeric to allow
-- fractional takeoffs (linear feet, sheets). unit_cost is optional and
-- feeds margin reporting later. line_total is generated, never stored
-- out of sync.
create table erp.estimate_lines (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references erp.estimates(id) on delete cascade,
  order_form_item_id uuid references erp.order_form_items(id),
  description text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index estimate_lines_estimate_idx on erp.estimate_lines(estimate_id);

create trigger estimate_lines_set_updated_at
  before update on erp.estimate_lines
  for each row execute function public.set_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────
-- Estimates are managed by the same roles that manage orders (admin,
-- pm) — matches ERP_ROLE_TABS (only admin/pm see the estimates tab) and
-- canManageEstimates() in src/lib/auth/roles.ts. Kept as its own guard
-- so estimate access can diverge from orders later without a rewrite.
create or replace function erp.can_manage_estimates()
returns boolean
language sql stable
as $$
  select public.my_role() in ('admin', 'pm');
$$;

alter table erp.estimates      enable row level security;
alter table erp.estimate_lines enable row level security;

create policy estimates_read  on erp.estimates
  for select using (erp.can_manage_estimates());
create policy estimates_write on erp.estimates
  for all using (erp.can_manage_estimates());

create policy estimate_lines_read  on erp.estimate_lines
  for select using (erp.can_manage_estimates());
create policy estimate_lines_write on erp.estimate_lines
  for all using (erp.can_manage_estimates());

-- ─── Sequence grant ────────────────────────────────────────────
-- Default privileges in 00001 cover TABLES only, not sequences, so the
-- estimate_number default (nextval) would fail for real users without
-- this — the same fix applied to order_number_seq in 00006.
grant usage, select on sequence erp.estimate_number_seq to authenticated, service_role;
