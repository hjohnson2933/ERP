-- ════════════════════════════════════════════════════════════════
-- ERP — estimation module Stage 5: price lock-in on submit.
--
-- Submitting an estimate snapshots every line's cost/markup/sell price
-- into an immutable record and points the estimate at it
-- (locked_snapshot_id). While locked, the estimate shows those frozen
-- prices instead of the live roll-up. Re-pricing takes a NEW snapshot
-- (keeping the old one for comparison); unlocking clears the pointer and
-- returns to live pricing.
--
-- Run after 00011.
-- ════════════════════════════════════════════════════════════════

-- One snapshot = the estimate's pricing frozen at a moment in time.
create table erp.estimate_snapshots (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references erp.estimates(id) on delete cascade,
  label text not null default '',        -- e.g. 'Submitted', 'Re-price'
  markup_pct numeric(6,3) not null default 0,
  total numeric(14,2) not null default 0,
  created_by uuid,                        -- soft ref to public.profiles.id
  created_at timestamptz not null default now()
);
create index estimate_snapshots_estimate_idx on erp.estimate_snapshots(estimate_id);

create table erp.estimate_snapshot_lines (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references erp.estimate_snapshots(id) on delete cascade,
  kind text not null,                     -- 'fixture' | 'material' | 'custom'
  description text not null default '',
  sku text,
  quantity numeric(12,2) not null,
  unit_cost numeric(12,2),
  markup_pct numeric(6,3),
  unit_price numeric(12,2) not null,
  line_total numeric(14,2) not null,
  position double precision not null default 0
);
create index estimate_snapshot_lines_snapshot_idx on erp.estimate_snapshot_lines(snapshot_id);

-- The estimate's current locked snapshot (NULL => live pricing).
alter table erp.estimates
  add column if not exists locked_snapshot_id uuid references erp.estimate_snapshots(id);

-- Lock (or re-price): freeze the current live line details into a new
-- snapshot and point the estimate at it. Returns the snapshot id.
create or replace function erp.lock_estimate(p_estimate_id uuid, p_label text)
returns uuid
language plpgsql
security invoker
as $$
declare
  snap_id uuid;
  snap_total numeric;
  est_markup numeric;
begin
  select markup_pct into est_markup from erp.estimates where id = p_estimate_id;

  insert into erp.estimate_snapshots (estimate_id, label, markup_pct, created_by)
  values (p_estimate_id, coalesce(p_label, ''), coalesce(est_markup, 0), auth.uid())
  returning id into snap_id;

  insert into erp.estimate_snapshot_lines
    (snapshot_id, kind, description, sku, quantity, unit_cost, markup_pct, unit_price, line_total, position)
  select snap_id, d.kind, d.description, d.sku, d.quantity, d.unit_cost, d.markup_pct, d.unit_price, d.line_total, d.position
  from erp.estimate_line_details d
  where d.estimate_id = p_estimate_id;

  select coalesce(sum(line_total), 0) into snap_total
  from erp.estimate_snapshot_lines where snapshot_id = snap_id;

  update erp.estimate_snapshots set total = snap_total where id = snap_id;
  update erp.estimates set locked_snapshot_id = snap_id where id = p_estimate_id;

  return snap_id;
end;
$$;

grant execute on function erp.lock_estimate(uuid, text) to authenticated, service_role;

-- Effective total per estimate: locked snapshot total if locked, else the
-- live rolled-up sum. Used by the estimates list.
create or replace view erp.estimate_totals
with (security_invoker = true) as
select
  e.id as estimate_id,
  (e.locked_snapshot_id is not null) as is_locked,
  case
    when e.locked_snapshot_id is not null
      then coalesce((select s.total from erp.estimate_snapshots s where s.id = e.locked_snapshot_id), 0)
    else coalesce((select sum(d.line_total) from erp.estimate_line_details d where d.estimate_id = e.id), 0)
  end::numeric(14,2) as total
from erp.estimates e;

grant select on erp.estimate_totals to authenticated, service_role;

-- RLS: same managers as estimates.
alter table erp.estimate_snapshots      enable row level security;
alter table erp.estimate_snapshot_lines enable row level security;

create policy estimate_snapshots_read  on erp.estimate_snapshots for select using (erp.can_manage_estimates());
create policy estimate_snapshots_write on erp.estimate_snapshots for all    using (erp.can_manage_estimates());
create policy estimate_snapshot_lines_read  on erp.estimate_snapshot_lines for select using (erp.can_manage_estimates());
create policy estimate_snapshot_lines_write on erp.estimate_snapshot_lines for all    using (erp.can_manage_estimates());
