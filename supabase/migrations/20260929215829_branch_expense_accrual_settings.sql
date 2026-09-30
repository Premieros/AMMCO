create table if not exists public.branch_expense_accrual_settings (
  branch_id uuid not null references public.branches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month_start date not null,
  wages numeric(16,2) not null default 0 check (wages >= 0),
  branch_manager numeric(16,2) not null default 0 check (branch_manager >= 0),
  sector_manager numeric(16,2) not null default 0 check (sector_manager >= 0),
  rent numeric(16,2) not null default 0 check (rent >= 0),
  carried_expenses numeric(16,2) not null default 0,
  commission_rate numeric(8,6) not null default 0.03 check (commission_rate >= 0 and commission_rate <= 1),
  working_days_basis smallint not null default 26 check (working_days_basis between 1 and 31),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (branch_id, month_start),
  check (month_start = date_trunc('month', month_start)::date)
);

create index if not exists branch_expense_accrual_settings_org_month_idx
  on public.branch_expense_accrual_settings(organization_id, month_start);
create index if not exists branch_expense_accrual_settings_updated_by_idx
  on public.branch_expense_accrual_settings(updated_by);

alter table public.branch_expense_accrual_settings enable row level security;

grant select,insert,update on public.branch_expense_accrual_settings to authenticated;

drop policy if exists branch_expense_accrual_settings_select on public.branch_expense_accrual_settings;
create policy branch_expense_accrual_settings_select on public.branch_expense_accrual_settings
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.organization_id=branch_expense_accrual_settings.organization_id
      and exists (
        select 1 from public.branches b
        where b.id=branch_expense_accrual_settings.branch_id
          and b.organization_id=branch_expense_accrual_settings.organization_id
      )
      and (
        p.role='admin'::public.app_role
        or exists (
          select 1 from public.user_branch_access uba
          where uba.user_id=(select auth.uid())
            and uba.branch_id=branch_expense_accrual_settings.branch_id
        )
      )
  )
);

drop policy if exists branch_expense_accrual_settings_admin_write on public.branch_expense_accrual_settings;
drop policy if exists branch_expense_accrual_settings_admin_insert on public.branch_expense_accrual_settings;
drop policy if exists branch_expense_accrual_settings_admin_update on public.branch_expense_accrual_settings;

create policy branch_expense_accrual_settings_admin_insert on public.branch_expense_accrual_settings
for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and p.organization_id=branch_expense_accrual_settings.organization_id
      and exists (
        select 1 from public.branches b
        where b.id=branch_expense_accrual_settings.branch_id
          and b.organization_id=branch_expense_accrual_settings.organization_id
      )
  )
);

create policy branch_expense_accrual_settings_admin_update on public.branch_expense_accrual_settings
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and p.organization_id=branch_expense_accrual_settings.organization_id
      and exists (
        select 1 from public.branches b
        where b.id=branch_expense_accrual_settings.branch_id
          and b.organization_id=branch_expense_accrual_settings.organization_id
      )
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and p.organization_id=branch_expense_accrual_settings.organization_id
      and exists (
        select 1 from public.branches b
        where b.id=branch_expense_accrual_settings.branch_id
          and b.organization_id=branch_expense_accrual_settings.organization_id
      )
  )
);

comment on table public.branch_expense_accrual_settings is
  'Monthly fixed-expense accrual inputs replacing the consolidated management workbook formulas.';
