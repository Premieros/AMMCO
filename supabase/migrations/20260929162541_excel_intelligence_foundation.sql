-- AMMCO foundation schema
-- Mandatory target: Supabase project yumeijsyiphzdsulsubf ONLY.

create type public.app_role as enum ('admin','analyst','branch_user');
create type public.import_status as enum ('uploaded','processing','validated','approved','rejected','failed','superseded');
create type public.issue_severity as enum ('info','warning','error');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'branch_user',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_branch_access (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  version integer not null check (version > 0),
  status public.import_status not null default 'uploaded',
  original_file_name text not null,
  storage_path text not null unique,
  file_sha256 text not null check (length(file_sha256) = 64),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  workbook_schema_version text,
  replaces_batch_id uuid references public.import_batches(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  validated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  unique (branch_id, file_sha256),
  unique (branch_id, period_start, version),
  check (period_end >= period_start)
);

create index import_batches_branch_period_idx on public.import_batches(branch_id, period_start desc, version desc);
create index import_batches_status_idx on public.import_batches(status);

create table public.import_sheets (
  id bigserial primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  sheet_name text not null,
  sheet_index integer not null,
  row_count integer,
  column_count integer,
  source_checksum text,
  metadata jsonb not null default '{}'::jsonb,
  unique (batch_id, sheet_name)
);

create table public.import_validation_issues (
  id bigserial primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  sheet_name text,
  cell_ref text,
  row_number integer,
  code text not null,
  severity public.issue_severity not null,
  message text not null,
  raw_value jsonb,
  created_at timestamptz not null default now()
);

create index import_validation_issues_batch_idx on public.import_validation_issues(batch_id, severity);

create table public.import_raw_rows (
  id bigserial primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  sheet_name text not null,
  row_number integer not null,
  row_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (batch_id, sheet_name, row_number)
);

create index import_raw_rows_lookup_idx on public.import_raw_rows(batch_id, sheet_name, row_number);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_product_key text not null,
  name text not null,
  category text,
  model text,
  flavor text,
  barcode text,
  pack_description text,
  units_per_pack numeric,
  packs_per_carton numeric,
  retail_price numeric(14,2),
  wholesale_price numeric(14,2),
  carton_price numeric(14,2),
  pack_price numeric(14,2),
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_batch_id uuid references public.import_batches(id) on delete set null,
  last_seen_batch_id uuid references public.import_batches(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_product_key)
);

create index products_org_name_idx on public.products(organization_id, name);

create table public.branch_daily_metrics (
  id bigserial primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  gross_sales numeric(16,2) not null default 0,
  net_sales numeric(16,2) not null default 0,
  discounts numeric(16,2) not null default 0,
  collections numeric(16,2) not null default 0,
  opening_receivables numeric(16,2) not null default 0,
  closing_receivables numeric(16,2) not null default 0,
  cash_in numeric(16,2) not null default 0,
  cash_out numeric(16,2) not null default 0,
  closing_cash numeric(16,2) not null default 0,
  expenses numeric(16,2) not null default 0,
  returns_value numeric(16,2) not null default 0,
  bonuses_value numeric(16,2) not null default 0,
  gifts_value numeric(16,2) not null default 0,
  damages_value numeric(16,2) not null default 0,
  inventory_value numeric(16,2) not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  unique (batch_id, business_date)
);

create index branch_daily_metrics_branch_date_idx on public.branch_daily_metrics(branch_id, business_date);

create table public.sales_rep_daily (
  id bigserial primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  rep_name text not null,
  opening_balance numeric(16,2) not null default 0,
  sales numeric(16,2) not null default 0,
  collections numeric(16,2) not null default 0,
  discounts numeric(16,2) not null default 0,
  closing_balance numeric(16,2) not null default 0,
  collection_rate numeric(12,6),
  raw_payload jsonb not null default '{}'::jsonb,
  unique (batch_id, business_date, rep_name)
);

create index sales_rep_daily_branch_date_idx on public.sales_rep_daily(branch_id, business_date);

create table public.vehicle_daily (
  id bigserial primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  vehicle_label text,
  driver_name text,
  rep_name text,
  sales numeric(16,2) not null default 0,
  fuel_expense numeric(16,2) not null default 0,
  maintenance_expense numeric(16,2) not null default 0,
  other_expense numeric(16,2) not null default 0,
  total_expense numeric(16,2) not null default 0,
  opening_odometer numeric(16,2),
  closing_odometer numeric(16,2),
  raw_payload jsonb not null default '{}'::jsonb
);

create index vehicle_daily_branch_date_idx on public.vehicle_daily(branch_id, business_date);

create table public.inventory_daily (
  id bigserial primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  opening_qty numeric(18,4) not null default 0,
  incoming_factory_qty numeric(18,4) not null default 0,
  incoming_branches_qty numeric(18,4) not null default 0,
  sales_qty numeric(18,4) not null default 0,
  bonus_qty numeric(18,4) not null default 0,
  gifts_qty numeric(18,4) not null default 0,
  damages_qty numeric(18,4) not null default 0,
  return_factory_qty numeric(18,4) not null default 0,
  outgoing_branches_qty numeric(18,4) not null default 0,
  adjustments_qty numeric(18,4) not null default 0,
  closing_qty numeric(18,4) not null default 0,
  unit_value numeric(16,4),
  closing_value numeric(16,2),
  raw_payload jsonb not null default '{}'::jsonb
);

create index inventory_daily_branch_date_idx on public.inventory_daily(branch_id, business_date);
create index inventory_daily_product_idx on public.inventory_daily(product_id, business_date);

create table public.inventory_counts (
  id bigserial primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  count_date date not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  location_type text not null check (location_type in ('warehouse','vehicle','branch_total','other')),
  location_label text not null,
  book_qty numeric(18,4),
  actual_qty numeric(18,4),
  variance_qty numeric(18,4),
  unit_value numeric(16,4),
  variance_value numeric(16,2),
  raw_payload jsonb not null default '{}'::jsonb
);

create index inventory_counts_branch_date_idx on public.inventory_counts(branch_id, count_date);

create table public.cash_entries (
  id bigserial primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  entry_date date not null,
  direction text not null check (direction in ('in','out')),
  category text,
  account_code text,
  description text,
  amount numeric(16,2) not null check (amount >= 0),
  running_balance numeric(16,2),
  raw_payload jsonb not null default '{}'::jsonb
);

create index cash_entries_branch_date_idx on public.cash_entries(branch_id, entry_date);

create table public.customer_visits (
  id bigserial primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  visit_date date not null,
  rep_name text,
  customer_name text not null,
  address text,
  governorate text,
  phone text,
  price_list text,
  invoice_amount numeric(16,2) not null default 0,
  paid_amount numeric(16,2) not null default 0,
  balance_amount numeric(16,2) not null default 0,
  payment_type text,
  raw_payload jsonb not null default '{}'::jsonb
);

create index customer_visits_branch_date_idx on public.customer_visits(branch_id, visit_date);
create index customer_visits_customer_idx on public.customer_visits(customer_name);

-- Seed the company and first analyzed branch.
insert into public.organizations(name, slug)
values ('AMMCO', 'ammco')
on conflict (slug) do nothing;

insert into public.branches(organization_id, code, name)
select id, 'borg-el-arab', 'برج العرب'
from public.organizations
where slug = 'ammco'
on conflict (organization_id, code) do nothing;

-- RLS
alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.user_branch_access enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_sheets enable row level security;
alter table public.import_validation_issues enable row level security;
alter table public.import_raw_rows enable row level security;
alter table public.products enable row level security;
alter table public.branch_daily_metrics enable row level security;
alter table public.sales_rep_daily enable row level security;
alter table public.vehicle_daily enable row level security;
alter table public.inventory_daily enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.cash_entries enable row level security;
alter table public.customer_visits enable row level security;

create policy organizations_select on public.organizations
for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id = (select auth.uid())
    and p.organization_id = organizations.id
    and p.is_active
));

create policy branches_select on public.branches
for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id = (select auth.uid())
    and p.organization_id = branches.organization_id
    and p.is_active
));

create policy profiles_select on public.profiles
for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.profiles me
    where me.user_id = (select auth.uid())
      and me.organization_id = profiles.organization_id
      and me.role = 'admin'
      and me.is_active
  )
);

create policy branch_access_select on public.user_branch_access
for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles me
    join public.branches b on b.organization_id = me.organization_id
    where me.user_id = (select auth.uid())
      and me.role = 'admin'
      and me.is_active
      and b.id = user_branch_access.branch_id
  )
);

create policy import_batches_select on public.import_batches
for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id = (select auth.uid())
    and p.organization_id = import_batches.organization_id
    and p.is_active
    and (
      p.role in ('admin','analyst')
      or exists (
        select 1 from public.user_branch_access uba
        where uba.user_id = p.user_id and uba.branch_id = import_batches.branch_id
      )
    )
));

create policy import_batches_insert on public.import_batches
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and status = 'uploaded'
  and exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.organization_id = import_batches.organization_id
      and p.is_active
      and (
        p.role = 'admin'
        or exists (
          select 1 from public.user_branch_access uba
          where uba.user_id = p.user_id and uba.branch_id = import_batches.branch_id
        )
      )
  )
);

create policy products_select on public.products
for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id = (select auth.uid())
    and p.organization_id = products.organization_id
    and p.is_active
));

-- Child reporting/import tables are visible only when the parent batch is visible.
create policy import_sheets_select on public.import_sheets for select to authenticated
using (exists (select 1 from public.import_batches b where b.id = import_sheets.batch_id));

create policy import_validation_issues_select on public.import_validation_issues for select to authenticated
using (exists (select 1 from public.import_batches b where b.id = import_validation_issues.batch_id));

create policy import_raw_rows_select on public.import_raw_rows for select to authenticated
using (exists (select 1 from public.import_batches b where b.id = import_raw_rows.batch_id));

create policy branch_daily_metrics_select on public.branch_daily_metrics for select to authenticated
using (exists (select 1 from public.import_batches b where b.id = branch_daily_metrics.batch_id and b.status = 'approved'));

create policy sales_rep_daily_select on public.sales_rep_daily for select to authenticated
using (exists (select 1 from public.import_batches b where b.id = sales_rep_daily.batch_id and b.status = 'approved'));

create policy vehicle_daily_select on public.vehicle_daily for select to authenticated
using (exists (select 1 from public.import_batches b where b.id = vehicle_daily.batch_id and b.status = 'approved'));

create policy inventory_daily_select on public.inventory_daily for select to authenticated
using (exists (select 1 from public.import_batches b where b.id = inventory_daily.batch_id and b.status = 'approved'));

create policy inventory_counts_select on public.inventory_counts for select to authenticated
using (exists (select 1 from public.import_batches b where b.id = inventory_counts.batch_id and b.status = 'approved'));

create policy cash_entries_select on public.cash_entries for select to authenticated
using (exists (select 1 from public.import_batches b where b.id = cash_entries.batch_id and b.status = 'approved'));

create policy customer_visits_select on public.customer_visits for select to authenticated
using (exists (select 1 from public.import_batches b where b.id = customer_visits.batch_id and b.status = 'approved'));

-- Private workbook bucket. Files use branch UUID as the first path segment.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branch-workbooks',
  'branch-workbooks',
  false,
  26214400,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy branch_workbooks_select on storage.objects
for select to authenticated
using (
  bucket_id = 'branch-workbooks'
  and exists (
    select 1
    from public.branches b
    join public.profiles p on p.organization_id = b.organization_id
    where b.id::text = (storage.foldername(name))[1]
      and p.user_id = (select auth.uid())
      and p.is_active
      and (
        p.role in ('admin','analyst')
        or exists (
          select 1 from public.user_branch_access uba
          where uba.user_id = p.user_id and uba.branch_id = b.id
        )
      )
  )
);

create policy branch_workbooks_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'branch-workbooks'
  and exists (
    select 1
    from public.branches b
    join public.profiles p on p.organization_id = b.organization_id
    where b.id::text = (storage.foldername(name))[1]
      and p.user_id = (select auth.uid())
      and p.is_active
      and (
        p.role = 'admin'
        or exists (
          select 1 from public.user_branch_access uba
          where uba.user_id = p.user_id and uba.branch_id = b.id
        )
      )
  )
);

create policy branch_workbooks_delete_admin on storage.objects
for delete to authenticated
using (
  bucket_id = 'branch-workbooks'
  and exists (
    select 1
    from public.branches b
    join public.profiles p on p.organization_id = b.organization_id
    where b.id::text = (storage.foldername(name))[1]
      and p.user_id = (select auth.uid())
      and p.is_active
      and p.role = 'admin'
  )
);

-- Dashboard view deliberately uses approved batches only.
create view public.v_branch_daily_kpis
with (security_invoker = true)
as
select
  m.branch_id,
  b.name as branch_name,
  m.business_date,
  m.gross_sales,
  m.net_sales,
  m.discounts,
  m.collections,
  m.opening_receivables,
  m.closing_receivables,
  m.expenses,
  m.cash_in,
  m.cash_out,
  m.closing_cash,
  m.inventory_value,
  m.returns_value,
  m.bonuses_value,
  m.gifts_value,
  m.damages_value,
  m.batch_id
from public.branch_daily_metrics m
join public.branches b on b.id = m.branch_id
join public.import_batches ib on ib.id = m.batch_id
where ib.status = 'approved';

revoke all on all tables in schema public from anon;
grant select on public.organizations, public.branches, public.profiles, public.user_branch_access to authenticated;
grant select, insert on public.import_batches to authenticated;
grant select on public.import_sheets, public.import_validation_issues, public.import_raw_rows to authenticated;
grant select on public.products, public.branch_daily_metrics, public.sales_rep_daily, public.vehicle_daily,
  public.inventory_daily, public.inventory_counts, public.cash_entries, public.customer_visits,
  public.v_branch_daily_kpis to authenticated;
