create table public.warehouse_daily_summary (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  opening_qty numeric(18,4) not null default 0,
  opening_value numeric(18,2) not null default 0,
  incoming_factory_qty numeric(18,4) not null default 0,
  incoming_factory_value numeric(18,2) not null default 0,
  incoming_branches_qty numeric(18,4) not null default 0,
  incoming_branches_value numeric(18,2) not null default 0,
  sales_qty numeric(18,4) not null default 0,
  sales_value numeric(18,2) not null default 0,
  bonus_qty numeric(18,4) not null default 0,
  bonus_value numeric(18,2) not null default 0,
  gifts_qty numeric(18,4) not null default 0,
  gifts_value numeric(18,2) not null default 0,
  damages_qty numeric(18,4) not null default 0,
  damages_value numeric(18,2) not null default 0,
  return_factory_qty numeric(18,4) not null default 0,
  return_factory_value numeric(18,2) not null default 0,
  outgoing_branches_qty numeric(18,4) not null default 0,
  outgoing_branches_value numeric(18,2) not null default 0,
  adjustment_qty numeric(18,4) not null default 0,
  adjustment_value numeric(18,2) not null default 0,
  closing_qty numeric(18,4) not null default 0,
  closing_value numeric(18,2) not null default 0,
  source_qty_row integer not null,
  source_value_row integer not null,
  raw_payload jsonb not null default '{}'::jsonb,
  unique(batch_id,business_date)
);

create index warehouse_daily_summary_branch_date_idx
  on public.warehouse_daily_summary(branch_id,business_date);

alter table public.warehouse_daily_summary enable row level security;

create policy warehouse_daily_summary_select
on public.warehouse_daily_summary
for select to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id=(select auth.uid())
      and p.is_active
      and (
        p.role in ('admin','analyst')
        or exists (
          select 1 from public.user_branch_access uba
          where uba.user_id=p.user_id
            and uba.branch_id=warehouse_daily_summary.branch_id
        )
      )
  )
);

grant select on public.warehouse_daily_summary to authenticated;
