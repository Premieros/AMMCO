-- AMMCO branch/day locking, multi-treasury, approval workflow and audited treasury edits.

create table if not exists public.import_day_snapshots (
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  source_hash text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (batch_id, business_date)
);

create table if not exists public.branch_day_submissions (
  branch_id uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  current_batch_id uuid not null references public.import_batches(id) on delete restrict,
  current_hash text not null,
  first_submitted_at timestamptz not null,
  last_submitted_at timestamptz not null,
  locked_at timestamptz not null,
  first_uploaded_by uuid references auth.users(id) on delete set null,
  primary key (branch_id, business_date)
);

create table if not exists public.import_day_changes (
  id bigint generated always as identity primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  previous_batch_id uuid not null references public.import_batches(id) on delete restrict,
  old_hash text not null,
  new_hash text not null,
  old_snapshot jsonb not null default '{}'::jsonb,
  new_snapshot jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolution_status text not null default 'detected'
    check (resolution_status in ('detected','accepted','rejected')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  unique(batch_id,business_date)
);

create table if not exists public.treasury_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null default 'cash'
    check (account_type in ('cash','bank','other')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(branch_id,code)
);

create unique index if not exists treasury_accounts_one_default_per_branch
  on public.treasury_accounts(branch_id) where is_default;

alter table public.cash_entries
  add column if not exists treasury_account_id uuid references public.treasury_accounts(id) on delete restrict;

create index if not exists import_day_snapshots_branch_date_idx
  on public.import_day_snapshots(branch_id,business_date);
create index if not exists import_day_changes_branch_date_idx
  on public.import_day_changes(branch_id,business_date,detected_at desc);
create index if not exists treasury_accounts_branch_idx
  on public.treasury_accounts(branch_id,is_active);
create index if not exists cash_entries_treasury_date_idx
  on public.cash_entries(treasury_account_id,entry_date);

create index if not exists branch_day_submissions_current_batch_idx
  on public.branch_day_submissions(current_batch_id);
create index if not exists branch_day_submissions_first_uploaded_by_idx
  on public.branch_day_submissions(first_uploaded_by);
create index if not exists import_day_changes_previous_batch_idx
  on public.import_day_changes(previous_batch_id);
create index if not exists import_day_changes_resolved_by_idx
  on public.import_day_changes(resolved_by);
create index if not exists treasury_accounts_organization_idx
  on public.treasury_accounts(organization_id);
create index if not exists treasury_accounts_created_by_idx
  on public.treasury_accounts(created_by);

insert into public.treasury_accounts (organization_id,branch_id,code,name,account_type,is_default)
select b.organization_id,b.id,'MAIN','الخزنة الرئيسية','cash',true
from public.branches b
where not exists (
  select 1 from public.treasury_accounts ta
  where ta.branch_id=b.id and ta.is_default
);

update public.cash_entries ce
set treasury_account_id=ta.id
from public.treasury_accounts ta
where ta.branch_id=ce.branch_id
  and ta.is_default
  and ce.treasury_account_id is null;

alter table public.import_day_snapshots enable row level security;
alter table public.branch_day_submissions enable row level security;
alter table public.import_day_changes enable row level security;
alter table public.treasury_accounts enable row level security;

grant select on public.import_day_snapshots,public.branch_day_submissions,public.import_day_changes,public.treasury_accounts to authenticated;
grant insert,update on public.treasury_accounts to authenticated;
grant update on public.import_batches to authenticated;
grant insert,update on public.branch_day_submissions to authenticated;
grant update on public.import_day_changes to authenticated;

drop policy if exists treasury_accounts_select on public.treasury_accounts;
create policy treasury_accounts_select on public.treasury_accounts
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.organization_id=treasury_accounts.organization_id
      and (
        p.role='admin'::public.app_role
        or exists (
          select 1 from public.user_branch_access uba
          where uba.user_id=(select auth.uid()) and uba.branch_id=treasury_accounts.branch_id
        )
      )
  )
);

drop policy if exists treasury_accounts_admin_write on public.treasury_accounts;
drop policy if exists treasury_accounts_admin_insert on public.treasury_accounts;
drop policy if exists treasury_accounts_admin_update on public.treasury_accounts;

create policy treasury_accounts_admin_insert on public.treasury_accounts
for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and p.organization_id=treasury_accounts.organization_id
  )
);

create policy treasury_accounts_admin_update on public.treasury_accounts
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and p.organization_id=treasury_accounts.organization_id
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and p.organization_id=treasury_accounts.organization_id
  )
);

drop policy if exists import_day_snapshots_select on public.import_day_snapshots;
create policy import_day_snapshots_select on public.import_day_snapshots
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and (
        p.role='admin'::public.app_role
        or exists (
          select 1 from public.user_branch_access uba
          where uba.user_id=(select auth.uid()) and uba.branch_id=import_day_snapshots.branch_id
        )
      )
  )
);

drop policy if exists branch_day_submissions_select on public.branch_day_submissions;
create policy branch_day_submissions_select on public.branch_day_submissions
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and (
        p.role='admin'::public.app_role
        or exists (
          select 1 from public.user_branch_access uba
          where uba.user_id=(select auth.uid()) and uba.branch_id=branch_day_submissions.branch_id
        )
      )
  )
);

drop policy if exists import_day_changes_select on public.import_day_changes;
create policy import_day_changes_select on public.import_day_changes
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and (
        p.role='admin'::public.app_role
        or exists (
          select 1 from public.user_branch_access uba
          where uba.user_id=(select auth.uid()) and uba.branch_id=import_day_changes.branch_id
        )
      )
  )
);

drop policy if exists import_batches_admin_update on public.import_batches;
create policy import_batches_admin_update on public.import_batches
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and p.organization_id=import_batches.organization_id
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and p.organization_id=import_batches.organization_id
  )
);

drop policy if exists branch_day_submissions_admin_write on public.branch_day_submissions;
drop policy if exists branch_day_submissions_admin_insert on public.branch_day_submissions;
drop policy if exists branch_day_submissions_admin_update on public.branch_day_submissions;

create policy branch_day_submissions_admin_insert on public.branch_day_submissions
for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    join public.branches b on b.organization_id=p.organization_id
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and b.id=branch_day_submissions.branch_id
  )
);

create policy branch_day_submissions_admin_update on public.branch_day_submissions
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    join public.branches b on b.organization_id=p.organization_id
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and b.id=branch_day_submissions.branch_id
  )
)
with check (
  exists (
    select 1 from public.profiles p
    join public.branches b on b.organization_id=p.organization_id
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and b.id=branch_day_submissions.branch_id
  )
);

drop policy if exists import_day_changes_admin_update on public.import_day_changes;
create policy import_day_changes_admin_update on public.import_day_changes
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    join public.branches b on b.organization_id=p.organization_id
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and b.id=import_day_changes.branch_id
  )
)
with check (
  exists (
    select 1 from public.profiles p
    join public.branches b on b.organization_id=p.organization_id
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and b.id=import_day_changes.branch_id
  )
);

drop policy if exists branches_admin_insert on public.branches;
create policy branches_admin_insert on public.branches
for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and p.organization_id=branches.organization_id
  )
);

drop policy if exists branches_admin_update on public.branches;
create policy branches_admin_update on public.branches
for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and p.organization_id=branches.organization_id
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active
      and p.role='admin'::public.app_role
      and p.organization_id=branches.organization_id
  )
);

create or replace function public.create_branch_with_default_treasury(p_code text,p_name text)
returns public.branches
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare me public.profiles; created public.branches;
begin
  select * into me from public.profiles where user_id=(select auth.uid()) and is_active;
  if me.user_id is null or me.role <> 'admin'::public.app_role then raise exception 'NOT_AUTHORIZED'; end if;

  insert into public.branches (organization_id,code,name,is_active)
  values (me.organization_id,lower(trim(p_code)),trim(p_name),true)
  returning * into created;

  insert into public.treasury_accounts (
    organization_id,branch_id,code,name,account_type,is_default,is_active,created_by
  ) values (
    me.organization_id,created.id,'MAIN','الخزنة الرئيسية','cash',true,true,(select auth.uid())
  );

  return created;
end;
$$;
revoke all on function public.create_branch_with_default_treasury(text,text) from public,anon;
grant execute on function public.create_branch_with_default_treasury(text,text) to authenticated;

create or replace function public.approve_import_batch(p_batch_id uuid)
returns public.import_batches
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare target public.import_batches; me public.profiles;
begin
  select * into target from public.import_batches where id=p_batch_id for update;
  if target.id is null then raise exception 'IMPORT_BATCH_NOT_FOUND'; end if;

  select * into me from public.profiles where user_id=(select auth.uid()) and is_active;
  if me.user_id is null or me.role <> 'admin'::public.app_role or me.organization_id <> target.organization_id then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if target.status <> 'validated'::public.import_status then raise exception 'IMPORT_BATCH_NOT_VALIDATED'; end if;
  if exists (
    select 1 from public.import_day_changes c
    where c.batch_id=p_batch_id and c.resolution_status='detected'
  ) then raise exception 'HISTORICAL_CHANGES_REQUIRE_REVIEW'; end if;

  update public.import_batches
  set status='superseded'::public.import_status
  where branch_id=target.branch_id and period_start=target.period_start
    and status='approved'::public.import_status and id<>target.id;

  update public.import_batches
  set status='approved'::public.import_status,approved_at=now(),approved_by=(select auth.uid())
  where id=target.id
  returning * into target;

  insert into public.branch_day_submissions (
    branch_id,business_date,current_batch_id,current_hash,
    first_submitted_at,last_submitted_at,locked_at,first_uploaded_by
  )
  select s.branch_id,s.business_date,s.batch_id,s.source_hash,
         target.uploaded_at,target.uploaded_at,now(),target.uploaded_by
  from public.import_day_snapshots s
  where s.batch_id=target.id
  on conflict (branch_id,business_date)
  do update set
    current_batch_id=excluded.current_batch_id,
    current_hash=excluded.current_hash,
    last_submitted_at=excluded.last_submitted_at;

  return target;
end;
$$;
revoke all on function public.approve_import_batch(uuid) from public,anon;
grant execute on function public.approve_import_batch(uuid) to authenticated;

alter table public.cash_entry_correction_log
  add column if not exists old_description text,
  add column if not exists new_description text,
  add column if not exists old_treasury_account_id uuid references public.treasury_accounts(id) on delete set null,
  add column if not exists new_treasury_account_id uuid references public.treasury_accounts(id) on delete set null;

create index if not exists cash_entry_correction_log_branch_idx
  on public.cash_entry_correction_log(branch_id);
create index if not exists cash_entry_correction_log_changed_by_idx
  on public.cash_entry_correction_log(changed_by);
create index if not exists cash_entry_correction_log_old_treasury_idx
  on public.cash_entry_correction_log(old_treasury_account_id);
create index if not exists cash_entry_correction_log_new_treasury_idx
  on public.cash_entry_correction_log(new_treasury_account_id);

create or replace function public.audit_cash_entry_correction()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare correction_reason text;
begin
  if old.canonical_category is not distinct from new.canonical_category
     and old.expense_group is not distinct from new.expense_group
     and old.description is not distinct from new.description
     and old.treasury_account_id is not distinct from new.treasury_account_id then
    return new;
  end if;

  correction_reason := nullif(current_setting('app.correction_reason', true), '');

  insert into public.cash_entry_correction_log (
    cash_entry_id,branch_id,
    old_canonical_category,new_canonical_category,
    old_expense_group,new_expense_group,
    old_description,new_description,
    old_treasury_account_id,new_treasury_account_id,
    reason,changed_by
  ) values (
    new.id,new.branch_id,
    old.canonical_category,new.canonical_category,
    old.expense_group,new.expense_group,
    old.description,new.description,
    old.treasury_account_id,new.treasury_account_id,
    coalesce(correction_reason,'تصحيح يدوي'),auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists trg_audit_cash_entry_correction on public.cash_entries;
create trigger trg_audit_cash_entry_correction
after update of canonical_category,expense_group,description,treasury_account_id
on public.cash_entries
for each row execute function public.audit_cash_entry_correction();

create or replace function public.edit_cash_entry(
  p_cash_entry_id bigint,p_description text,p_canonical_category text,
  p_expense_group text,p_treasury_account_id uuid,p_reason text
)
returns public.cash_entries
language plpgsql
security invoker
set search_path=public,pg_catalog
as $$
declare updated_row public.cash_entries;
begin
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  perform set_config('app.correction_reason',trim(p_reason),true);

  update public.cash_entries
  set description=nullif(trim(coalesce(p_description,'')),''),
      canonical_category=nullif(trim(coalesce(p_canonical_category,'')),''),
      expense_group=nullif(trim(coalesce(p_expense_group,'')),''),
      treasury_account_id=p_treasury_account_id
  where id=p_cash_entry_id
  returning * into updated_row;

  if updated_row.id is null then raise exception 'CASH_ENTRY_NOT_FOUND_OR_NOT_ALLOWED'; end if;
  return updated_row;
end;
$$;
revoke all on function public.edit_cash_entry(bigint,text,text,text,uuid,text) from public,anon;
grant execute on function public.edit_cash_entry(bigint,text,text,text,uuid,text) to authenticated;
