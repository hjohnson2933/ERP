-- ════════════════════════════════════════════════════════════════
-- ERP — estimate approval lifecycle.
--
--   Draft ──submit──▶ Submitted/Locked ──approve──▶ Approved (immutable)
--                            │
--                            └──reject──▶ Draft + an auto note
--
-- Approve records WHO signed off and WHEN, and freezes the estimate: no
-- further edits to it or its lines. To change an approved estimate you
-- take a REVISION — a new draft carrying the same header and lines, with
-- the same base number plus an -r2 suffix, linked back to the original.
--
-- Re-pricing in place (00012) stays available for a locked estimate that
-- has NOT been approved. Once approved, re-pricing means a new revision,
-- so an approved price is never silently rewritten.
--
-- Also tidies the status enum: 'accepted' (from 00007, never wired to
-- anything) becomes 'approved'.
--
-- Run after 00017.
-- ════════════════════════════════════════════════════════════════

-- ─── Tidy the status enum ──────────────────────────────────────
-- Rebuilt rather than ALTER TYPE ... ADD VALUE, which cannot be used in
-- the same transaction that adds it — the Supabase SQL Editor runs this
-- file as one transaction, so ADD VALUE would fail here.
do $$
begin
  if not exists (select 1 from pg_type t
                 join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'erp' and t.typname = 'estimate_status_v2') then
    create type erp.estimate_status_v2 as enum ('draft', 'sent', 'approved', 'rejected', 'expired');
  end if;
end $$;

do $$
begin
  -- Only convert while the column still uses the old type.
  if exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    where n.nspname = 'erp' and c.relname = 'estimates' and a.attname = 'status'
      and t.typname = 'estimate_status'
  ) then
    alter table erp.estimates alter column status drop default;
    alter table erp.estimates
      alter column status type erp.estimate_status_v2
      using (case when status::text = 'accepted' then 'approved' else status::text end)::erp.estimate_status_v2;
    alter table erp.estimates alter column status set default 'draft';

    drop type erp.estimate_status;
    alter type erp.estimate_status_v2 rename to estimate_status;
  end if;
end $$;

-- ─── Sign-off + revision linkage ───────────────────────────────
alter table erp.estimates
  add column if not exists approved_by uuid;          -- soft ref to public.profiles.id
alter table erp.estimates
  add column if not exists approved_at timestamptz;
-- The estimate this one is a revision OF (always the ROOT original, so
-- a family is one hop deep and easy to list).
alter table erp.estimates
  add column if not exists revision_of uuid references erp.estimates(id);
alter table erp.estimates
  add column if not exists revision_number integer not null default 1;

create index if not exists estimates_revision_of_idx
  on erp.estimates(revision_of) where revision_of is not null;

-- ─── Immutability of an approved estimate ──────────────────────
-- Enforced in the DB, not just the UI: an approved price is a commitment.
create or replace function erp.block_approved_estimate_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      raise exception 'This estimate is approved and can no longer be changed. Create a revision instead.';
    end if;
    return old;
  end if;

  if old.status = 'approved' then
    raise exception 'This estimate is approved and can no longer be changed. Create a revision instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists estimates_block_approved on erp.estimates;
create trigger estimates_block_approved
  before update or delete on erp.estimates
  for each row execute function erp.block_approved_estimate_change();

-- Same for its lines: saveEstimate deletes and re-inserts them, so the
-- guard has to cover all three verbs.
create or replace function erp.block_approved_estimate_line_change()
returns trigger
language plpgsql
as $$
declare
  parent_status erp.estimate_status;
  parent_id uuid;
begin
  parent_id := coalesce(new.estimate_id, old.estimate_id);
  select status into parent_status from erp.estimates where id = parent_id;

  if parent_status = 'approved' then
    raise exception 'This estimate is approved and can no longer be changed. Create a revision instead.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists estimate_lines_block_approved on erp.estimate_lines;
create trigger estimate_lines_block_approved
  before insert or update or delete on erp.estimate_lines
  for each row execute function erp.block_approved_estimate_line_change();

-- ─── Approve ───────────────────────────────────────────────────
-- Records the signer and the moment. Only a LOCKED estimate can be
-- approved: approving live pricing would approve a number that could
-- still move underneath it.
create or replace function erp.approve_estimate(p_estimate_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  est record;
begin
  select * into est from erp.estimates where id = p_estimate_id;
  if not found then
    raise exception 'Estimate not found.';
  end if;
  if est.status = 'approved' then
    raise exception 'This estimate is already approved.';
  end if;
  if est.locked_snapshot_id is null then
    raise exception 'Lock the pricing before approving: submit the estimate first.';
  end if;

  update erp.estimates
  set status      = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  where id = p_estimate_id;
end;
$$;

grant execute on function erp.approve_estimate(uuid) to authenticated, service_role;

-- ─── Reject ────────────────────────────────────────────────────
-- Sign-off rejection sends the estimate back to Draft (editable, pricing
-- unlocked) and appends an audit note naming the rejector and the time.
-- Snapshots are kept — the history of what was quoted is not erased.
create or replace function erp.reject_estimate(p_estimate_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  est record;
  who text;
  stamp timestamptz := now();
  note text;
begin
  select * into est from erp.estimates where id = p_estimate_id;
  if not found then
    raise exception 'Estimate not found.';
  end if;
  if est.status = 'approved' then
    raise exception 'This estimate is approved and can no longer be changed. Create a revision instead.';
  end if;

  select full_name into who from public.profiles where id = auth.uid();
  who := coalesce(nullif(trim(who), ''), 'a user');

  note := 'Rejected by ' || who || ' at ' || to_char(stamp, 'YYYY-MM-DD HH24:MI');

  update erp.estimates
  set status             = 'draft',
      locked_snapshot_id = null,
      notes              = case
                             when coalesce(trim(notes), '') = '' then note
                             else notes || E'\n' || note
                           end
  where id = p_estimate_id;
end;
$$;

grant execute on function erp.reject_estimate(uuid) to authenticated, service_role;

-- ─── Revise ────────────────────────────────────────────────────
-- Copy an estimate into a NEW draft: same header, same lines, unlocked,
-- numbered <base>-r<n> and linked to the root original. This is how an
-- approved estimate gets re-priced.
create or replace function erp.revise_estimate(p_estimate_id uuid)
returns uuid
language plpgsql
security invoker
as $$
declare
  src record;
  root_id uuid;
  root_number text;
  base_number text;
  next_rev integer;
  new_id uuid;
begin
  select * into src from erp.estimates where id = p_estimate_id;
  if not found then
    raise exception 'Estimate not found.';
  end if;

  -- Revisions hang off the ROOT, so the family stays one hop deep.
  root_id := coalesce(src.revision_of, src.id);
  select estimate_number into root_number from erp.estimates where id = root_id;

  -- Strip any existing -rN so revising a revision does not stack suffixes.
  base_number := regexp_replace(root_number, '-r[0-9]+$', '');

  select coalesce(max(revision_number), 1) + 1
  into next_rev
  from erp.estimates
  where id = root_id or revision_of = root_id;

  insert into erp.estimates (
    estimate_number, status, title, customer_id, customer_name,
    contact_email, contact_phone, valid_until, job_id,
    material_markup_pct, labor_markup_pct, notes, created_by,
    revision_of, revision_number
  )
  values (
    base_number || '-r' || next_rev, 'draft', src.title, src.customer_id, src.customer_name,
    src.contact_email, src.contact_phone, src.valid_until, src.job_id,
    src.material_markup_pct, src.labor_markup_pct, src.notes, auth.uid(),
    root_id, next_rev
  )
  returning id into new_id;

  -- Copy the lines as they were defined (not as they were priced): the
  -- new draft re-prices live off current costs, which is the point.
  insert into erp.estimate_lines (
    estimate_id, order_form_item_id, material_id, fixture_id, description,
    quantity, unit_price, unit_cost, material_markup_pct, labor_markup_pct, position
  )
  select
    new_id, order_form_item_id, material_id, fixture_id, description,
    quantity, unit_price, unit_cost, material_markup_pct, labor_markup_pct, position
  from erp.estimate_lines
  where estimate_id = p_estimate_id;

  return new_id;
end;
$$;

grant execute on function erp.revise_estimate(uuid) to authenticated, service_role;
