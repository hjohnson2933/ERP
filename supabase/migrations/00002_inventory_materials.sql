-- ════════════════════════════════════════════════════════════════
-- ERP — inventory & materials module
-- Replaces InventoryPro for inventory tracking and material
-- consumption tied to jobs.
-- ════════════════════════════════════════════════════════════════

create table erp.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  active boolean not null default true,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger locations_set_updated_at
  before update on erp.locations
  for each row execute function public.set_updated_at();

create table erp.materials (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  description text not null default '',
  unit_of_measure text not null,
  category text not null default '',
  default_unit_cost numeric(10,2),
  reorder_point integer,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger materials_set_updated_at
  before update on erp.materials
  for each row execute function public.set_updated_at();

create table erp.stock_levels (
  material_id uuid not null references erp.materials(id) on delete cascade,
  location_id uuid not null references erp.locations(id) on delete cascade,
  quantity numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (material_id, location_id)
);

create table erp.stock_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references erp.materials(id),
  location_id uuid not null references erp.locations(id),
  movement_type text not null check (movement_type in ('receipt','issue','adjustment','transfer_out','transfer_in')),
  quantity numeric not null,
  job_id uuid,                     -- soft ref to public.jobs.id
  transfer_group_id uuid,
  note text not null default '',
  created_by uuid,                 -- soft ref to public.profiles.id
  created_at timestamptz not null default now(),
  constraint stock_movements_quantity_sign check (
    movement_type = 'adjustment' or quantity > 0
  )
);

create index stock_movements_material_location_idx on erp.stock_movements(material_id, location_id);
create index stock_movements_job_id_idx on erp.stock_movements(job_id) where job_id is not null;

create or replace function erp.apply_stock_movement()
returns trigger language plpgsql as $$
declare
  delta numeric;
begin
  delta := case new.movement_type
    when 'receipt'      then  new.quantity
    when 'transfer_in'  then  new.quantity
    when 'issue'        then -new.quantity
    when 'transfer_out' then -new.quantity
    when 'adjustment'   then  new.quantity
  end;

  insert into erp.stock_levels (material_id, location_id, quantity, updated_at)
  values (new.material_id, new.location_id, delta, now())
  on conflict (material_id, location_id)
  do update set
    quantity   = erp.stock_levels.quantity + excluded.quantity,
    updated_at = now();

  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on erp.stock_movements
  for each row execute function erp.apply_stock_movement();

alter table erp.locations       enable row level security;
alter table erp.materials       enable row level security;
alter table erp.stock_levels    enable row level security;
alter table erp.stock_movements enable row level security;

create policy locations_read    on erp.locations       for select using (public.my_role() is not null);
create policy locations_write   on erp.locations       for all    using (public.is_admin());

create policy materials_read    on erp.materials       for select using (public.my_role() is not null);
create policy materials_write   on erp.materials       for all    using (public.is_editor());

create policy stock_levels_read on erp.stock_levels    for select using (public.my_role() is not null);

create policy stock_movements_read   on erp.stock_movements for select using (public.my_role() is not null);
create policy stock_movements_insert on erp.stock_movements for insert with check (public.is_editor());
