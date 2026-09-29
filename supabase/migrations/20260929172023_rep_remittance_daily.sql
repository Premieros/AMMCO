create table if not exists public.rep_remittance_daily (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  rep_slot smallint not null check (rep_slot between 1 and 50),
  rep_name text not null,
  opening_debt numeric(18,2) not null default 0,
  sales_amount numeric(18,2) not null default 0,
  deposit_amount numeric(18,2) not null default 0,
  closing_debt numeric(18,2) not null default 0,
  source_sheet text not null default 'توريدات',
  source_row integer,
  raw_payload jsonb not null default '{}'::jsonb,
  unique (batch_id, business_date, rep_slot)
);

create index if not exists rep_remittance_daily_branch_date_idx
  on public.rep_remittance_daily(branch_id, business_date);
create index if not exists rep_remittance_daily_rep_idx
  on public.rep_remittance_daily(branch_id, rep_name, business_date);

alter table public.rep_remittance_daily enable row level security;

drop policy if exists rep_remittance_daily_select on public.rep_remittance_daily;
create policy rep_remittance_daily_select
on public.rep_remittance_daily
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.is_active
      and (
        p.role in ('admin','analyst')
        or exists (
          select 1 from public.user_branch_access uba
          where uba.user_id = p.user_id
            and uba.branch_id = rep_remittance_daily.branch_id
        )
      )
  )
);

grant select on public.rep_remittance_daily to authenticated;
