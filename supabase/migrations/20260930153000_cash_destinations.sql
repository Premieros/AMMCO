begin;

create table if not exists public.cash_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  destination_type text not null default 'other'
    check (destination_type in ('bank','branch','factory','supplier','expense','cash','other')),
  branch_id uuid null references public.branches(id) on delete set null,
  treasury_account_id uuid null references public.treasury_accounts(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id,name)
);

alter table public.cash_destinations enable row level security;
revoke all on table public.cash_destinations from anon, authenticated;
grant select, insert, update on table public.cash_destinations to authenticated;

drop policy if exists cash_destinations_select on public.cash_destinations;
create policy cash_destinations_select on public.cash_destinations
for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.is_active
    and p.organization_id=cash_destinations.organization_id
));

drop policy if exists cash_destinations_admin_insert on public.cash_destinations;
create policy cash_destinations_admin_insert on public.cash_destinations
for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.is_active and p.role='admin'::public.app_role
    and p.organization_id=cash_destinations.organization_id
));

drop policy if exists cash_destinations_admin_update on public.cash_destinations;
create policy cash_destinations_admin_update on public.cash_destinations
for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.is_active and p.role='admin'::public.app_role
    and p.organization_id=cash_destinations.organization_id
))
with check (exists (
  select 1 from public.profiles p
  where p.user_id=(select auth.uid()) and p.is_active and p.role='admin'::public.app_role
    and p.organization_id=cash_destinations.organization_id
));

alter table public.cash_entries
  add column if not exists destination_id uuid null references public.cash_destinations(id) on delete set null;

alter table public.cash_entry_correction_log
  add column if not exists old_destination_id uuid null references public.cash_destinations(id) on delete set null,
  add column if not exists new_destination_id uuid null references public.cash_destinations(id) on delete set null;

create index if not exists cash_entries_destination_id_idx on public.cash_entries(destination_id);
create index if not exists cash_destinations_org_active_idx on public.cash_destinations(organization_id,is_active);

create or replace function public.set_cash_entry_destination(
  p_cash_entry_id bigint,
  p_destination_id uuid,
  p_reason text
)
returns public.cash_entries
language plpgsql
security invoker
set search_path to 'public','pg_catalog'
as $$
declare updated_row public.cash_entries; dest_org uuid; entry_org uuid;
begin
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  select b.organization_id into entry_org
  from public.cash_entries ce join public.branches b on b.id=ce.branch_id
  where ce.id=p_cash_entry_id;
  if entry_org is null then raise exception 'CASH_ENTRY_NOT_FOUND_OR_NOT_ALLOWED'; end if;
  if p_destination_id is not null then
    select organization_id into dest_org from public.cash_destinations where id=p_destination_id and is_active;
    if dest_org is null or dest_org<>entry_org then raise exception 'INVALID_DESTINATION'; end if;
  end if;
  perform set_config('app.correction_reason',trim(p_reason),true);
  update public.cash_entries set destination_id=p_destination_id where id=p_cash_entry_id returning * into updated_row;
  if updated_row.id is null then raise exception 'CASH_ENTRY_NOT_FOUND_OR_NOT_ALLOWED'; end if;
  return updated_row;
end;
$$;

revoke all on function public.set_cash_entry_destination(bigint,uuid,text) from public, anon;
grant execute on function public.set_cash_entry_destination(bigint,uuid,text) to authenticated;

insert into public.cash_destinations (organization_id,name,destination_type)
select distinct b.organization_id,x.name,x.destination_type
from public.branches b
cross join (values
  ('المصنع','factory'),('بنك مصر','bank'),('CIB','bank'),('البنك الأهلي','bank'),
  ('مورد','supplier'),('مصروف','expense'),('خزينة رئيسية','cash'),('أخرى','other')
) as x(name,destination_type)
on conflict (organization_id,name) do nothing;

insert into public.cash_destinations (organization_id,name,destination_type,branch_id)
select b.organization_id,'فرع - '||b.name,'branch',b.id
from public.branches b where b.is_active
on conflict (organization_id,name) do update
set branch_id=excluded.branch_id,destination_type='branch',is_active=true;

commit;