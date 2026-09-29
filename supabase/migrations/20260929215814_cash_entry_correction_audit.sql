create table if not exists public.cash_entry_correction_log (
  id bigint generated always as identity primary key,
  cash_entry_id bigint not null references public.cash_entries(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  old_canonical_category text,
  new_canonical_category text,
  old_expense_group text,
  new_expense_group text,
  reason text not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

alter table public.cash_entry_correction_log enable row level security;

create index if not exists cash_entry_correction_log_entry_idx
  on public.cash_entry_correction_log(cash_entry_id, changed_at desc);

drop policy if exists cash_entries_select on public.cash_entries;
create policy cash_entries_select
on public.cash_entries
for select
to authenticated
using (
  exists (
    select 1
    from public.import_batches ib
    where ib.id = cash_entries.batch_id
      and ib.status = 'approved'::public.import_status
  )
  and (
    exists (
      select 1
      from public.profiles p
      join public.branches b on b.organization_id = p.organization_id
      where p.user_id = (select auth.uid())
        and p.is_active
        and p.role = 'admin'::public.app_role
        and b.id = cash_entries.branch_id
    )
    or exists (
      select 1
      from public.user_branch_access uba
      where uba.user_id = (select auth.uid())
        and uba.branch_id = cash_entries.branch_id
    )
  )
);

drop policy if exists cash_entries_admin_update on public.cash_entries;
create policy cash_entries_admin_update
on public.cash_entries
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    join public.branches b on b.organization_id = p.organization_id
    where p.user_id = (select auth.uid())
      and p.role = 'admin'::public.app_role
      and p.is_active
      and b.id = cash_entries.branch_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    join public.branches b on b.organization_id = p.organization_id
    where p.user_id = (select auth.uid())
      and p.role = 'admin'::public.app_role
      and p.is_active
      and b.id = cash_entries.branch_id
  )
);

drop policy if exists cash_entry_correction_log_select on public.cash_entry_correction_log;
create policy cash_entry_correction_log_select
on public.cash_entry_correction_log
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    join public.branches b on b.organization_id = p.organization_id
    where p.user_id = (select auth.uid())
      and p.is_active
      and b.id = cash_entry_correction_log.branch_id
  )
);

create or replace function public.audit_cash_entry_correction()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  correction_reason text;
begin
  if old.canonical_category is not distinct from new.canonical_category
     and old.expense_group is not distinct from new.expense_group then
    return new;
  end if;

  correction_reason := nullif(current_setting('app.correction_reason', true), '');

  insert into public.cash_entry_correction_log (
    cash_entry_id,
    branch_id,
    old_canonical_category,
    new_canonical_category,
    old_expense_group,
    new_expense_group,
    reason,
    changed_by
  )
  values (
    new.id,
    new.branch_id,
    old.canonical_category,
    new.canonical_category,
    old.expense_group,
    new.expense_group,
    coalesce(correction_reason, 'تصحيح يدوي'),
    auth.uid()
  );

  return new;
end;
$$;

revoke all on function public.audit_cash_entry_correction() from public, anon, authenticated;

drop trigger if exists trg_audit_cash_entry_correction on public.cash_entries;
create trigger trg_audit_cash_entry_correction
after update of canonical_category, expense_group
on public.cash_entries
for each row
execute function public.audit_cash_entry_correction();

create or replace function public.correct_cash_entry(
  p_cash_entry_id bigint,
  p_canonical_category text,
  p_expense_group text,
  p_reason text
)
returns public.cash_entries
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  updated_row public.cash_entries;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'CORRECTION_REASON_REQUIRED';
  end if;

  perform set_config('app.correction_reason', trim(p_reason), true);

  update public.cash_entries
  set canonical_category = nullif(trim(coalesce(p_canonical_category, '')), ''),
      expense_group = nullif(trim(coalesce(p_expense_group, '')), '')
  where id = p_cash_entry_id
  returning * into updated_row;

  if updated_row.id is null then
    raise exception 'CASH_ENTRY_NOT_FOUND_OR_NOT_ALLOWED';
  end if;

  return updated_row;
end;
$$;

revoke all on function public.correct_cash_entry(bigint,text,text,text) from public, anon;
grant execute on function public.correct_cash_entry(bigint,text,text,text) to authenticated;
